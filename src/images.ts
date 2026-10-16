import sharp from 'sharp';
import { fail } from './errors.js';
import { MAX_IMAGE_BYTES, sha256 } from './workspace.js';

export const MAX_PIXELS = 40_000_000;
export const SPLIT_POLICY = { version: 1, threshold: 2000, height: 1600, overlap: 160, max_crops: 64 } as const;
const decodeOptions = { limitInputPixels: MAX_PIXELS, failOn: 'warning' as const };
export type CropRecord = { path: string; original: string; order: number; left: number; top: number;
  width: number; height: number; overlap_top: number; sha256: string; bytes: number };

export async function inspectImage(bytes: Buffer) {
  if (bytes.length > MAX_IMAGE_BYTES) fail('FILE_TOO_LARGE', '이미지는 최대 20 MiB까지 지원합니다.');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!png && !jpeg && !webp) fail('INVALID_IMAGE', 'PNG·JPEG·WebP 정지 이미지 파일을 선택하세요.');
  try {
    const decoder = sharp(bytes, decodeOptions);
    const meta = await decoder.metadata();
    if (!meta.width || !meta.height || !['png', 'jpeg', 'webp'].includes(meta.format)
      || (meta.pages ?? 1) > 1 || meta.width * meta.height > MAX_PIXELS) throw new Error('Invalid image');
    await decoder.stats();
    const rotated = (meta.orientation ?? 1) >= 5;
    return { width: meta.width, height: meta.height, format: meta.format,
      extension: meta.format === 'jpeg' ? 'jpg' : meta.format,
      orientation: meta.orientation ?? 1,
      display_width: rotated ? meta.height : meta.width,
      display_height: rotated ? meta.width : meta.height };
  } catch {
    return fail('INVALID_IMAGE', '이미지를 읽을 수 없습니다. 정지 이미지인지와 손상·크기(최대 4천만 픽셀)를 확인하세요.');
  }
}

export function cropRegions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    fail('INVALID_IMAGE', '분할할 이미지 크기를 확인하세요.');
  }
  const regions: { left: number; top: number; width: number; height: number }[] = [];
  if (height <= SPLIT_POLICY.threshold) return regions;
  for (let top = 0; top < height; top += SPLIT_POLICY.height - SPLIT_POLICY.overlap) {
    if (regions.length === SPLIT_POLICY.max_crops) fail('SPLIT_LIMIT', '분할본이 64장을 넘습니다. 더 짧은 이미지 사본으로 나누어 입력하세요.');
    const partHeight = Math.min(SPLIT_POLICY.height, height - top);
    regions.push({ left: 0, top, width, height: partHeight });
    if (top + partHeight === height) break;
  }
  return regions;
}

// Generate one crop at a time; coordinates refer to the EXIF-oriented image,
// without resizing. The caller keeps the source file byte-for-byte intact.
export async function* imageCrops(bytes: Buffer, image: Awaited<ReturnType<typeof inspectImage>>) {
  const regions = cropRegions(image.display_width, image.display_height);
  if (!regions.length) return;
  const { data, info } = await sharp(bytes, decodeOptions).autoOrient().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  let total = 0;
  for (const [index, region] of regions.entries()) {
    const crop = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .extract(region).png().toBuffer();
    total += crop.length;
    if (crop.length > MAX_IMAGE_BYTES || total > 100 * 1024 * 1024) {
      fail('SPLIT_LIMIT', '분할본이 크기 제한(장당 20 MiB, 합계 100 MiB)을 넘었습니다. 더 작은 사본을 입력하세요.');
    }
    yield { bytes: crop, record: { path: `crop-${String(index + 1).padStart(3, '0')}.png`,
      original: `original-001.${image.extension}`, order: index + 1, ...region,
      overlap_top: index === 0 ? 0 : SPLIT_POLICY.overlap,
      sha256: sha256(crop), bytes: crop.length } };
  }
}

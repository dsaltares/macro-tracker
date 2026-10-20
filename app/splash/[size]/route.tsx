import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { appBackground } from '@/lib/brand';
import { parseSplashSize, splashScreens, splashSize } from '@/lib/splash';

export const dynamicParams = false;

export const generateStaticParams = () =>
  splashScreens.map((screen) => ({ size: splashSize(screen) }));

const iconShare = 0.3;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const size = parseSplashSize((await params).size);
  if (!size) {
    notFound();
  }
  const icon = await readFile(join(process.cwd(), 'public/icons/icon.svg'));
  const side = Math.round(Math.min(size.width, size.height) * iconShare);
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        background: appBackground.dark.hex,
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: ImageResponse renders through Satori, which draws a plain img and nothing else */}
      <img
        alt=""
        src={`data:image/svg+xml;base64,${icon.toString('base64')}`}
        width={side}
        height={side}
      />
    </div>,
    size,
  );
}

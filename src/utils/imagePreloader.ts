/**
 * 图片预加载工具
 * 用于预加载下一场景的图片资源
 */

interface PreloadResult {
  success: boolean;
  src: string;
}

/**
 * 预加载单张图片
 */
export function preloadImage(src: string): Promise<PreloadResult> {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      resolve({ success: true, src });
    };

    img.onerror = () => {
      // 尝试 PNG 回退
      if (src.endsWith('.webp')) {
        const pngSrc = src.replace('.webp', '.png');
        const fallbackImg = new Image();
        fallbackImg.onload = () => resolve({ success: true, src: pngSrc });
        fallbackImg.onerror = () => resolve({ success: false, src });
        fallbackImg.src = pngSrc;
      } else {
        resolve({ success: false, src });
      }
    };

    img.src = src;
  });
}

/**
 * 预加载多张图片
 */
export async function preloadImages(sources: string[]): Promise<PreloadResult[]> {
  const results = await Promise.all(
    sources.map(src => preloadImage(src))
  );
  return results;
}

/**
 * 预加载游戏场景资源
 */
export function preloadGameScene(): Promise<PreloadResult[]> {
  return preloadImages([
    '/game_bg.webp',
  ]);
}

/**
 * 预加载菜单资源（包括下一场景）
 */
export function preloadMenuScene(): Promise<PreloadResult[]> {
  return preloadImages([
    '/main_menu_bg.webp',      // 菜单背景（首屏必需）
    '/character-create-bg.webp', // 创建角色背景（下一场景）
    '/game_bg.webp',            // 游戏背景（下一场景）
  ]);
}

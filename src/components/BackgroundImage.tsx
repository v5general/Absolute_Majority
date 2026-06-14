import React, { useState, useEffect } from 'react';

/**
 * 支持现代格式的背景图片组件
 * - WebP 优先，PNG 回退
 * - 响应式图片（移动端加载小图）
 */
export const BackgroundImage: React.FC<{
  image: string;
  className?: string;
  children?: React.ReactNode;
}> = ({ image, className = '', children }) => {
  const [imageSrc, setImageSrc] = useState('');

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    // 加载图片并回退
    const loadImageWithFallback = (imagePath: string, fallbackPath: string) => {
      const img = new Image();

      // 设置超时（5秒后强制回退）
      timeoutId = setTimeout(() => {
        if (isMounted) {
          console.log(`Image load timeout: ${imagePath}, trying fallback`);
          const fallbackImg = new Image();
          fallbackImg.onload = () => {
            if (isMounted) setImageSrc(fallbackPath);
          };
          fallbackImg.onerror = () => {
            if (isMounted) console.error('Both WebP and PNG failed to load');
          };
          fallbackImg.src = fallbackPath;
        }
      }, 5000);

      img.onload = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (isMounted) {
          console.log(`Successfully loaded: ${imagePath}`);
          setImageSrc(imagePath);
        }
      };

      img.onerror = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (isMounted) {
          console.log(`Failed to load: ${imagePath}, trying fallback: ${fallbackPath}`);
          const fallbackImg = new Image();
          fallbackImg.onload = () => {
            if (isMounted) setImageSrc(fallbackPath);
          };
          fallbackImg.onerror = () => {
            if (isMounted) console.error('Both WebP and PNG failed to load');
          };
          fallbackImg.src = fallbackPath;
        }
      };

      img.src = imagePath;
    };

    // 移动端检测
    const isMobile = () => {
      return window.innerWidth <= 768;
    };

    // 加载图片
    const mobile = isMobile();
    const mobileSuffix = mobile ? '_mobile' : '';

    // 先尝试 WebP，失败则回退到 PNG
    const webpPath = `/${image}${mobileSuffix}.webp`;
    const pngPath = `/${image}.png`; // 回退时始终使用完整 PNG（无 mobile 后缀）

    loadImageWithFallback(webpPath, pngPath);

    // 清理函数
    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [image]);

  const style: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundImage: imageSrc ? `url(${imageSrc})` : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed',
    zIndex: 0,
  };

  return (
    <>
      {imageSrc && <div style={style} className={className} />}
      {children}
    </>
  );
};

import React, { useState, useEffect } from 'react';

/**
 * 支持现代格式的背景图片组件
 * - WebP 优先，PNG 回退
 * - 简化的逻辑，更好的兼容性
 */
export const BackgroundImage: React.FC<{
  image: string;
  className?: string;
  children?: React.ReactNode;
}> = ({ image, className = '', children }) => {
  const [imageSrc, setImageSrc] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    console.log(`[BackgroundImage] Loading image: ${image}`);

    // 加载图片并回退
    const loadImageWithFallback = (webpPath: string, pngPath: string) => {
      // 先尝试 WebP
      const webpImg = new Image();

      webpImg.onload = () => {
        if (isMounted) {
          console.log(`[BackgroundImage] ✓ WebP loaded: ${webpPath}`);
          setImageSrc(webpPath);
          setIsLoaded(true);
        }
      };

      webpImg.onerror = () => {
        if (isMounted) {
          console.log(`[BackgroundImage] ✗ WebP failed, trying PNG: ${pngPath}`);
          // WebP 失败，尝试 PNG
          const pngImg = new Image();
          pngImg.onload = () => {
            if (isMounted) {
              console.log(`[BackgroundImage] ✓ PNG loaded: ${pngPath}`);
              setImageSrc(pngPath);
              setIsLoaded(true);
            }
          };
          pngImg.onerror = () => {
            if (isMounted) {
              console.error(`[BackgroundImage] ✗✗ Both WebP and PNG failed for: ${image}`);
            }
          };
          pngImg.src = pngPath;
        }
      };

      // 开始加载 WebP
      console.log(`[BackgroundImage] → Loading WebP: ${webpPath}`);
      webpImg.src = webpPath;
    };

    // 构建路径（不使用 mobile 后缀，因为用户没有创建 mobile 版本）
    const webpPath = `/${image}.webp`;
    const pngPath = `/${image}.png`;

    loadImageWithFallback(webpPath, pngPath);

    // 清理函数
    return () => {
      isMounted = false;
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
    // 添加渐显动画，避免图片突然跳出来
    opacity: isLoaded ? 1 : 0,
    transition: 'opacity 0.3s ease-in',
  };

  return (
    <>
      {imageSrc && <div style={style} className={className} />}
      {children}
    </>
  );
};

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
    // 检测 WebP 支持
    const checkWebPSupport = () => {
      return new Promise<boolean>((resolve) => {
        const webP = new Image();
        webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBeSyxABHgHwAAA/0//AAAA';
        webP.onload = webP.onerror = () => {
          resolve(webP.width === 1);
        };
      });
    };

    // 获取设备类型（移动端/桌面端）
    const isMobile = () => {
      return window.innerWidth <= 768;
    };

    // 根据设备选择分辨率
    const selectImage = async () => {
      const supportsWebP = await checkWebPSupport();
      const mobile = isMobile();

      // 移动端使用较小版本（如果存在）
      const mobileSuffix = mobile ? '_mobile' : '';
      const ext = supportsWebP ? 'webp' : 'png';

      // 尝试加载 WebP（或 PNG）
      const imagePath = `/${image}${mobileSuffix}.${ext}`;

      // 验证图片是否存在
      const img = new Image();
      img.src = imagePath;
      img.onload = () => setImageSrc(imagePath);
      img.onerror = () => {
        // 回退到 PNG（如果 WebP 失败）
        if (ext === 'webp') {
          const fallbackPath = `/${image}.png`;
          const fallbackImg = new Image();
          fallbackImg.src = fallbackPath;
          fallbackImg.onload = () => setImageSrc(fallbackPath);
        }
      };
    };

    selectImage();
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

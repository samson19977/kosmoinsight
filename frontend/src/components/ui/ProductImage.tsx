import React, { useState } from 'react';

export const packageEmoji: Record<string, string> = {
  large: '🩸', medium: '🌸', small: '🌿', nursing: '🤱', mix: '✨', pantyliner: '🛡️',
};

export const packagePhoto: Record<string, string> = {
  large: '/images/large-package.png',
  medium: '/images/medium-package.png',
  small: '/images/small-package.png',
  nursing: '/images/nursing-pads.png',
  mix: '/images/mix-package.png',
  pantyliner: '/images/pantyliner-package.png',
};

export const packageColor: Record<string, string> = {
  large: 'from-rose-50 to-pink-50',
  medium: 'from-pink-50 to-rose-50',
  small: 'from-teal-50 to-emerald-50',
  nursing: 'from-amber-50 to-yellow-50',
  mix: 'from-purple-50 to-fuchsia-50',
  pantyliner: 'from-sky-50 to-blue-50',
};

interface ProductImageProps {
  packageType?: string;
  imageUrl?: string;
  name?: string;
  className?: string;
  emojiClassName?: string;
}

// Renders the real product photo when we have one for this package type,
// falls back to a soft gradient + emoji tile if the photo is missing or fails to load.
const ProductImage: React.FC<ProductImageProps> = ({ packageType = '', imageUrl, name, className = '', emojiClassName = '' }) => {
  const localPhoto = packagePhoto[packageType];
  const src = localPhoto || imageUrl;
  const [failed, setFailed] = useState(false);
  const bg = packageColor[packageType] ?? 'from-gray-50 to-gray-100';

  if (!src || failed) {
    return (
      <div className={`bg-gradient-to-br ${bg} flex items-center justify-center ${className}`}>
        <span className={emojiClassName}>{packageEmoji[packageType] ?? '📦'}</span>
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-br ${bg} flex items-center justify-center overflow-hidden ${className}`}>
      <img
        src={src}
        alt={name || 'KosmoPads product'}
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-300"
      />
    </div>
  );
};

export default ProductImage;

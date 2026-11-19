import { useState } from 'react';
import { getInitials } from '../utils/analytics';

interface PlayerAvatarProps {
  fotmobId: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<PlayerAvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-16 h-16 text-base',
  xl: 'w-24 h-24 text-xl',
};

export function PlayerAvatar({
  fotmobId,
  name,
  size = 'md',
  className = '',
}: PlayerAvatarProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = `https://images.fotmob.com/image_resources/playerimages/${fotmobId}.png`;
  const initials = getInitials(name);

  return (
    <div
      className={`${SIZE_CLASSES[size]} ${className} rounded-full overflow-hidden flex items-center justify-center font-semibold tracking-tight bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 shrink-0 select-none relative`}
      aria-label={name}
    >
      <span aria-hidden={loaded && !failed}>{initials}</span>
      {fotmobId && !failed && (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 2) {
              setLoaded(true);
            } else {
              setFailed(true);
            }
          }}
          onError={() => setFailed(true)}
          className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-200 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
}

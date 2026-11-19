interface FootyFablesLogoProps {
  variant?: 'white' | 'color' | 'auto';
  className?: string;
  height?: number;
}

/**
 * Exact geometric SVG recreation of the FootyFables brand mark
 * ("footyfables" with twin joined 'o's and asymmetric brow wedges).
 */
export function FootyFablesLogo({
  variant = 'auto',
  className = '',
  height = 28,
}: FootyFablesLogoProps) {
  const isWhite = variant === 'white';
  const isColor = variant === 'color';

  const textClass = isWhite
    ? 'fill-white'
    : isColor
    ? 'fill-[#2A4746]'
    : 'fill-[#2A4746] dark:fill-white';

  const wedgeClass = isWhite
    ? 'fill-white'
    : isColor
    ? 'fill-[#1B7F82]'
    : 'fill-[#1B7F82] dark:fill-[#2DD4BF]';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 540 120"
      height={height}
      className={`w-auto select-none ${className}`}
      role="img"
      aria-label="FootyFables"
    >
      {/* Left eyebrow wedge above first 'o' */}
      <polygon
        points="42,20 75,30 72,39 38,35"
        className={wedgeClass}
      />
      {/* Right eyebrow wedge above second 'o' */}
      <polygon
        points="92,28 134,8 140,21 96,38"
        className={wedgeClass}
      />

      {/* 'f' */}
      <path
        d="M20 96V48H12V36H20V31C20 20 27 14 38 14H44V26H39C35 26 33 28 33 32V36H44V48H33V96H20Z"
        className={textClass}
      />

      {/* First 'o' + Joined Second 'o' */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M58 40C41.4 40 29 52.6 29 68.5C29 84.4 41.4 97 58 97C68.6 97 77.6 91.6 82.5 83.2C87.4 91.6 96.4 97 107 97C123.6 97 136 84.4 136 68.5C136 52.6 123.6 40 107 40C96.4 40 87.4 45.4 82.5 53.8C77.6 45.4 68.6 40 58 40ZM58 53C66.6 53 72.5 59.6 72.5 68.5C72.5 77.4 66.6 84 58 84C49.4 84 43.5 77.4 43.5 68.5C43.5 59.6 49.4 53 58 53ZM107 53C115.6 53 121.5 59.6 121.5 68.5C121.5 77.4 115.6 84 107 84C98.4 84 92.5 77.4 92.5 68.5C92.5 59.6 98.4 53 107 53Z"
        className={textClass}
      />

      {/* 'tyfables' crisp geometric wordmark */}
      <text
        x="141"
        y="95"
        fontFamily="'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"
        fontWeight="800"
        fontSize="82"
        letterSpacing="-2.5"
        className={textClass}
      >
        tyfables
      </text>
    </svg>
  );
}

/**
 * Compact geometric twin-'oo' + eyebrow mark used when the desktop sidebar is collapsed.
 */
export function FootyFablesMark({
  variant = 'white',
  height = 26,
  className = '',
}: FootyFablesLogoProps) {
  const isWhite = variant === 'white';
  const isColor = variant === 'color';

  const textClass = isWhite
    ? 'fill-white'
    : isColor
    ? 'fill-[#2A4746]'
    : 'fill-[#2A4746] dark:fill-white';

  const wedgeClass = isWhite
    ? 'fill-[#2DD4BF]'
    : isColor
    ? 'fill-[#1B7F82]'
    : 'fill-[#1B7F82] dark:fill-[#2DD4BF]';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="20 4 126 100"
      height={height}
      className={`w-auto select-none ${className}`}
      role="img"
      aria-label="FootyFables"
    >
      <polygon points="42,20 75,30 72,39 38,35" className={wedgeClass} />
      <polygon points="92,28 134,8 140,21 96,38" className={wedgeClass} />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M58 40C41.4 40 29 52.6 29 68.5C29 84.4 41.4 97 58 97C68.6 97 77.6 91.6 82.5 83.2C87.4 91.6 96.4 97 107 97C123.6 97 136 84.4 136 68.5C136 52.6 123.6 40 107 40C96.4 40 87.4 45.4 82.5 53.8C77.6 45.4 68.6 40 58 40ZM58 53C66.6 53 72.5 59.6 72.5 68.5C72.5 77.4 66.6 84 58 84C49.4 84 43.5 77.4 43.5 68.5C43.5 59.6 49.4 53 58 53ZM107 53C115.6 53 121.5 59.6 121.5 68.5C121.5 77.4 115.6 84 107 84C98.4 84 92.5 77.4 92.5 68.5C92.5 59.6 98.4 53 107 53Z"
        className={textClass}
      />
    </svg>
  );
}


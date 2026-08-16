/**
 * The Namu mark, transcribed from svg/logo/namu-logo-transparent-*.svg.
 *
 * The geometry is exact to the supplied vector artwork: a 44-unit arc that
 * opens at the lower left, terminated by the Sahel dot. Per the brand board the
 * mark is never recoloured, rotated, or stretched — `tone` only chooses between
 * the two approved transparent variants.
 */

type Tone = 'dark' | 'light'

const strokeFor: Record<Tone, string> = {
  dark: '#1C1410',
  light: '#F7F0E3',
}

export function NamuLogo({
  tone = 'dark',
  className,
  height = 34,
  animated = false,
}: {
  tone?: Tone
  className?: string
  height?: number
  animated?: boolean
}) {
  const stroke = strokeFor[tone]
  const gradientId = `namu-wordmark-${tone}`

  return (
    <svg
      viewBox="0 0 360 130"
      height={height}
      width={(360 / 130) * height}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Namu"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#E8935A" />
          <stop offset="22%" stopColor={stroke} />
          <stop offset="100%" stopColor={stroke} />
        </linearGradient>
      </defs>

      <path
        d="M 104 65 A 44 44 0 1 0 60 109"
        stroke={stroke}
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
        style={
          animated
            ? {
                strokeDasharray: 260,
                ['--dash' as string]: '260',
                animation: 'namu-draw 1.1s cubic-bezier(0.22, 1, 0.36, 1) both',
              }
            : undefined
        }
      />
      <circle
        cx="60"
        cy="109"
        r="6"
        fill="#E8935A"
        style={
          animated
            ? { animation: 'namu-fade 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.9s both' }
            : undefined
        }
      />
      <text
        x="76"
        y="99"
        fontFamily="'Playfair Display', Georgia, 'Times New Roman', serif"
        fontSize="38"
        fontWeight="400"
        fill={`url(#${gradientId})`}
        letterSpacing="2"
        dominantBaseline="central"
        style={
          animated
            ? { animation: 'namu-fade 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.55s both' }
            : undefined
        }
      >
        namu
      </text>
    </svg>
  )
}

/** The symbol alone, for tight spaces: nav bars, favicons, avatars. */
export function NamuIcon({
  tone = 'dark',
  size = 28,
  className,
}: {
  tone?: Tone
  size?: number
  className?: string
}) {
  const stroke = strokeFor[tone]
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Namu"
    >
      <path
        d="M 104 60 A 44 44 0 1 0 60 104"
        stroke={stroke}
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="60" cy="104" r="8" fill="#E8935A" />
    </svg>
  )
}

/**
 * Theme-aware wrapper: renders the dark mark on light surfaces and the light
 * mark on dark ones, swapped by CSS so it works without a hydration round-trip.
 */
export function NamuLogoAuto({ height = 34, className }: { height?: number; className?: string }) {
  return (
    <span className={className}>
      <span className="block dark:hidden [[data-theme='dark']_&]:hidden">
        <NamuLogo tone="dark" height={height} />
      </span>
      <span className="hidden dark:block [[data-theme='dark']_&]:block">
        <NamuLogo tone="light" height={height} />
      </span>
    </span>
  )
}

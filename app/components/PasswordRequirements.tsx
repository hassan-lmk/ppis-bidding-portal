'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  getPasswordRulesStatus,
} from '../lib/password-policy'

type PasswordRequirementsProps = {
  password: string
  className?: string
  columns?: 1 | 2
}

const RULES: { key: keyof ReturnType<typeof getPasswordRulesStatus>; label: string }[] = [
  { key: 'length', label: `${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters` },
  { key: 'uppercase', label: 'One capital letter' },
  { key: 'lowercase', label: 'One lowercase letter' },
  { key: 'number', label: 'One number' },
  { key: 'special', label: 'One special character (!@#$%^&* etc.)' },
]

export default function PasswordRequirements({ password, className, columns = 1 }: PasswordRequirementsProps) {
  const status = getPasswordRulesStatus(password)

  return (
    <ul
      className={cn(
        'text-left',
        columns === 2 ? 'grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2' : 'space-y-2',
        className
      )}
      aria-live="polite"
    >
      {RULES.map(({ key, label }) => {
        const done = status[key]
        return (
          <li key={key} className="flex items-start gap-2.5 text-xs sm:text-sm">
            <span
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                done ? 'border-teal-600 bg-teal-600 text-white' : 'border-gray-300 bg-white',
              )}
              aria-hidden
            >
              {done ? <Check className="h-3 w-3 stroke-[3]" /> : null}
            </span>
            <span className={cn('leading-tight', done ? 'text-gray-800 font-medium' : 'text-gray-500')}>
              {label}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

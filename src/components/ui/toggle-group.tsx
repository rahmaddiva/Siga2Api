import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { createContext, useContext } from 'react'

import { cn } from '@/lib/utils'

const toggleVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-transparent hover:bg-muted',
        outline: 'border border-input bg-card hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-8 px-2.5 text-[13px]',
        lg: 'h-10 px-4',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

// shadcn meneruskan variant/size dari Root ke tiap Item lewat context; tanpa ini
// prop di Root diam-diam diabaikan.
const ToggleGroupContext = createContext<{
  variant?: 'default' | 'outline' | null
  size?: 'default' | 'sm' | 'lg' | null
}>({})

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn('flex items-center gap-1', className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>) {
  const ctx = useContext(ToggleGroupContext)

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={ctx.variant ?? variant}
      data-size={ctx.size ?? size}
      className={cn(toggleVariants({ variant: ctx.variant ?? variant, size: ctx.size ?? size }), className)}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem, toggleVariants }

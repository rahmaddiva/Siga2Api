import * as React from 'react'

import { cn } from '@/lib/utils'

function Table({
  className,
  containerClassName,
  maxHeight,
  ...props
}: React.ComponentProps<'table'> & {
  containerClassName?: string
  /** Batas tinggi scroller. `sticky` header hanya berfungsi bila scroller punya
   *  batas tinggi sendiri; tanpa ini thead menempel ke wrapper yang tak pernah
   *  menggulir vertikal. */
  maxHeight?: string
}) {
  return (
    <div
      data-slot="table-container"
      className={cn('relative w-full overflow-x-auto', containerClassName)}
      style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
    >
      <table
        data-slot="table"
        className={cn('w-full min-w-max caption-bottom border-collapse text-sm', className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('sticky top-0 z-10', className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t bg-muted/50 font-medium', className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-border/70 transition-colors hover:bg-muted/60 data-[state=selected]:bg-accent',
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-9 border-b border-border bg-muted px-3 py-2 text-left align-bottom text-xs font-semibold whitespace-nowrap text-foreground',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('px-3 py-2 align-top text-[13px] whitespace-nowrap', className)}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-xs text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }

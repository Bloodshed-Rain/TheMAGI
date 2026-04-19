import { ReactNode, TableHTMLAttributes } from "react";

export function DataTable({
  children,
  className,
  ...rest
}: { children: ReactNode } & TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={["data-table", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </table>
  );
}

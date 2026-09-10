export function splitInstallmentValue(
  totalValue: number,
  installmentCount: number
): number {
  if (installmentCount <= 0) return totalValue;
  return Math.round((totalValue / installmentCount) * 100) / 100;
}

export function getTotalFromInstallments(
  installmentValue: number,
  installmentCount: number
): number {
  if (!installmentCount || installmentCount <= 0) return installmentValue;
  return Math.round(installmentValue * installmentCount * 100) / 100;
}

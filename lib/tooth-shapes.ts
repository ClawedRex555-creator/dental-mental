export type ToothShape = "incisor" | "canine" | "premolar" | "molar";

export function getToothShape(number: number): ToothShape {
  const unit = number % 10;
  if (unit === 1 || unit === 2) return "incisor";
  if (unit === 3) return "canine";
  if (unit === 4 || unit === 5) return "premolar";
  return "molar";
}

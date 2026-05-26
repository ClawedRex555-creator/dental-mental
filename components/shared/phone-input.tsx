"use client";

import { Input } from "@/components/ui/input";
import { normalizePhoneInput, formatPhoneDisplay } from "@/lib/phone-utils";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
}

export function PhoneInput({ value, onChange, className, required }: PhoneInputProps) {
  const display = formatPhoneDisplay(value || "+7");

  return (
    <Input
      type="tel"
      className={className}
      value={display}
      required={required}
      placeholder="+7 (999) 000-00-00"
      onFocus={() => {
        if (!value || value === "+7") onChange("+7");
      }}
      onChange={(e) => onChange(normalizePhoneInput(e.target.value))}
    />
  );
}

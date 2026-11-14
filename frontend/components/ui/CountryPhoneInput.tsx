"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { parsePhoneNumberFromString, CountryCode } from "libphonenumber-js";

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

export interface CountryItem {
  code: CountryCode;
  name: string;
  dialCode: string;
  flag: string;
}

export const COUNTRIES: CountryItem[] = [
  { code: "IN", name: "India", dialCode: "+91", flag: "🇮🇳" },
  { code: "US", name: "United States", dialCode: "+1", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧" },
  { code: "AE", name: "United Arab Emirates", dialCode: "+971", flag: "🇦🇪" },
  { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
  { code: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺" },
  { code: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪" },
  { code: "FR", name: "France", dialCode: "+33", flag: "🇫🇷" },
  { code: "SG", name: "Singapore", dialCode: "+65", flag: "🇸🇬" },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966", flag: "🇸🇦" },
  { code: "PK", name: "Pakistan", dialCode: "+92", flag: "🇵🇰" },
  { code: "BD", name: "Bangladesh", dialCode: "+880", flag: "🇧🇩" },
  { code: "NP", name: "Nepal", dialCode: "+977", flag: "🇳🇵" },
  { code: "LK", name: "Sri Lanka", dialCode: "+94", flag: "🇱🇰" },
  { code: "JP", name: "Japan", dialCode: "+81", flag: "🇯🇵" },
  { code: "CN", name: "China", dialCode: "+86", flag: "🇨🇳" },
  { code: "BR", name: "Brazil", dialCode: "+55", flag: "🇧🇷" },
  { code: "ZA", name: "South Africa", dialCode: "+27", flag: "🇿🇦" },
  { code: "NG", name: "Nigeria", dialCode: "+234", flag: "🇳🇬" },
  { code: "PH", name: "Philippines", dialCode: "+63", flag: "🇵🇭" },
  { code: "ID", name: "Indonesia", dialCode: "+62", flag: "🇮🇩" },
  { code: "MY", name: "Malaysia", dialCode: "+60", flag: "🇲🇾" },
  { code: "NZ", name: "New Zealand", dialCode: "+64", flag: "🇳🇿" },
  { code: "IT", name: "Italy", dialCode: "+39", flag: "🇮🇹" },
  { code: "ES", name: "Spain", dialCode: "+34", flag: "🇪🇸" },
  { code: "NL", name: "Netherlands", dialCode: "+31", flag: "🇳🇱" },
  { code: "CH", name: "Switzerland", dialCode: "+41", flag: "🇨🇭" },
  { code: "SE", name: "Sweden", dialCode: "+46", flag: "🇸🇪" },
  { code: "IE", name: "Ireland", dialCode: "+353", flag: "🇮🇪" },
  { code: "MX", name: "Mexico", dialCode: "+52", flag: "🇲🇽" },
  { code: "QA", name: "Qatar", dialCode: "+974", flag: "🇶🇦" },
  { code: "KW", name: "Kuwait", dialCode: "+965", flag: "🇰🇼" },
  { code: "BH", name: "Bahrain", dialCode: "+973", flag: "🇧🇭" },
  { code: "OM", name: "Oman", dialCode: "+968", flag: "🇴🇲" },
];

export interface CountryPhoneInputProps {
  value?: string; // Can be initial E.164 or national
  onChange: (e164: string, isValid: boolean, nationalNumber: string, countryCode: string) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  error?: string | null;
  placeholder?: string;
}

export function CountryPhoneInput({
  value = "",
  onChange,
  disabled = false,
  required = true,
  id = "phone-input",
  error,
  placeholder = "98765 43210",
}: CountryPhoneInputProps) {
  const [selectedCountry, setSelectedCountry] = useState<CountryItem>(COUNTRIES[0]); // Default India (+91)
  const [nationalNumber, setNationalNumber] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [touched, setTouched] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Initialize or synchronize if external value is provided
  useEffect(() => {
    if (value && value.startsWith("+")) {
      for (const country of COUNTRIES) {
        if (value.startsWith(country.dialCode)) {
          const nat = value.slice(country.dialCode.length);
          setSelectedCountry(country);
          setNationalNumber(nat);
          return;
        }
      }
    } else if (value && !nationalNumber) {
      setNationalNumber(value.replace(/\D/g, ""));
    }
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  // Filtered country list based on search query
  const filteredCountries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q) ||
        c.code.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Validate and emit E.164 update
  const handleNumberChange = (rawText: string, country = selectedCountry) => {
    // Only allow digits and spaces/hyphens for typing convenience
    const cleaned = rawText.replace(/[^\d\s-]/g, "");
    setNationalNumber(cleaned);

    const digitsOnly = cleaned.replace(/\D/g, "");
    if (!digitsOnly) {
      onChange("", false, "", country.code);
      return;
    }

    try {
      const parsed = parsePhoneNumberFromString(digitsOnly, country.code);
      if (parsed && parsed.isValid()) {
        const e164 = parsed.format("E.164");
        onChange(e164, true, digitsOnly, country.code);
      } else {
        const fallback = `${country.dialCode}${digitsOnly}`;
        onChange(fallback, false, digitsOnly, country.code);
      }
    } catch {
      const fallback = `${country.dialCode}${digitsOnly}`;
      onChange(fallback, false, digitsOnly, country.code);
    }
  };

  const handleCountrySelect = (country: CountryItem) => {
    setSelectedCountry(country);
    setDropdownOpen(false);
    setSearchQuery("");
    handleNumberChange(nationalNumber, country);
  };

  // Check validation status for current input
  const digits = nationalNumber.replace(/\D/g, "");
  const parsed = digits ? parsePhoneNumberFromString(digits, selectedCountry.code) : null;
  const isValid = Boolean(parsed && parsed.isValid());
  const showValidationWarning = touched && digits.length > 0 && !isValid;

  return (
    <div className="w-full space-y-1.5" ref={dropdownRef}>
      <div className="relative flex items-center rounded-xl bg-zinc-900/90 border border-zinc-800 focus-within:border-amber-500/80 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all shadow-inner">
        {/* Country Selector Dropdown Trigger */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-zinc-200 hover:text-white bg-zinc-800/60 hover:bg-zinc-800/90 rounded-l-xl border-r border-zinc-800 transition-colors focus:outline-none shrink-0"
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
          aria-label="Select Country"
        >
          <span className="text-lg leading-none" role="img" aria-label={selectedCountry.name}>
            {selectedCountry.flag}
          </span>
          <span className="font-mono text-xs font-semibold text-amber-400">
            {selectedCountry.dialCode}
          </span>
          <ChevronDownIcon
            className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
              dropdownOpen ? "rotate-180 text-amber-400" : ""
            }`}
          />
        </button>

        {/* National Number Input */}
        <input
          id={id}
          type="tel"
          disabled={disabled}
          required={required}
          value={nationalNumber}
          onChange={(e) => handleNumberChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 font-mono tracking-wide focus:outline-none disabled:opacity-50"
          autoComplete="tel-national"
        />

        {/* Status Indicator Icon */}
        <div className="pr-3 flex items-center">
          {isValid ? (
            <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckIcon className="w-3 h-3 stroke-[3]" />
            </div>
          ) : digits.length > 0 ? (
            <div className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <span className="text-[10px] font-bold">!</span>
            </div>
          ) : null}
        </div>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-72 max-w-[90vw] rounded-xl bg-zinc-900 border border-zinc-700/80 shadow-2xl backdrop-blur-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Search Box */}
            <div className="p-2 border-b border-zinc-800 bg-zinc-950/70 flex items-center gap-2">
              <SearchIcon className="w-4 h-4 text-zinc-400 ml-1 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search country or code..."
                className="w-full bg-transparent text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none"
              />
            </div>

            {/* Country List */}
            <div className="max-h-56 overflow-y-auto divide-y divide-zinc-800/40 p-1 custom-scrollbar">
              {filteredCountries.length === 0 ? (
                <div className="py-4 text-center text-xs text-zinc-500">
                  No matching countries found
                </div>
              ) : (
                filteredCountries.map((c) => {
                  const isSelected = c.code === selectedCountry.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => handleCountrySelect(c)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors text-left ${
                        isSelected
                          ? "bg-amber-500/20 text-amber-300 font-semibold"
                          : "text-zinc-300 hover:bg-zinc-800/80 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="text-base leading-none">{c.flag}</span>
                        <span className="truncate">{c.name}</span>
                      </div>
                      <span className="font-mono text-zinc-400 text-[11px] shrink-0 ml-2">
                        {c.dialCode}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Validation warning or external error */}
      {error ? (
        <p className="text-xs text-rose-400 flex items-center gap-1 mt-1">
          <AlertCircleIcon className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : showValidationWarning ? (
        <p className="text-xs text-amber-400/90 flex items-center gap-1 mt-1">
          <AlertCircleIcon className="w-3.5 h-3.5 shrink-0" />
          <span>Please enter a valid phone number for {selectedCountry.name}.</span>
        </p>
      ) : null}
    </div>
  );
}

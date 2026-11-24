"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectDropdownProps {
  id: string;
  name: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onChange?: (value: string) => void;
}

export function SelectDropdown({
  id,
  name,
  options,
  value,
  defaultValue = "",
  placeholder = "Select an option",
  required = false,
  disabled = false,
  className = "",
  onChange,
}: SelectDropdownProps) {
  const generatedId = useId().replace(/:/g, "");
  const listboxId = `${generatedId}-options`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typeahead = useRef("");
  const typeaheadTimer = useRef<number | null>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [validationMessage, setValidationMessage] = useState("");
  const selectedValue = value ?? internalValue;
  const selectedOption = options.find((option) => option.value === selectedValue);

  function enabledIndex(start: number, direction: 1 | -1): number {
    for (let index = start; index >= 0 && index < options.length; index += direction) {
      const option = options[index];
      if (option && !option.disabled) return index;
    }
    return -1;
  }

  function showOptions(direction: 1 | -1 = 1, moveFromSelection = false) {
    const selectedIndex = options.findIndex((option) => option.value === selectedValue);
    const start = selectedIndex >= 0
      ? selectedIndex + (moveFromSelection ? direction : 0)
      : direction === 1 ? 0 : options.length - 1;
    const active = enabledIndex(start, direction);
    const fallback = direction === 1 ? 0 : options.length - 1;
    setActiveIndex(active >= 0 ? active : enabledIndex(fallback, direction));
    setOpen(true);
  }

  function choose(option: SelectOption) {
    if (option.disabled) return;
    if (value === undefined) setInternalValue(option.value);
    onChange?.(option.value);
    setValidationMessage("");
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Tab" && open) {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (!open) {
        showOptions(direction, true);
      } else {
        const next = enabledIndex(activeIndex + direction, direction);
        const fallback = direction === 1 ? 0 : options.length - 1;
        const wrapped = enabledIndex(fallback, direction);
        if (next >= 0 || wrapped >= 0) setActiveIndex(next >= 0 ? next : wrapped);
      }
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      if (!open) return;
      event.preventDefault();
      const next = event.key === "Home" ? enabledIndex(0, 1) : enabledIndex(options.length - 1, -1);
      if (next >= 0) setActiveIndex(next);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const activeOption = options[activeIndex];
      if (open && activeOption) choose(activeOption);
      else if (!open) showOptions();
      return;
    }
    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      typeahead.current += event.key.toLocaleLowerCase();
      if (typeaheadTimer.current !== null) window.clearTimeout(typeaheadTimer.current);
      typeaheadTimer.current = window.setTimeout(() => {
        typeahead.current = "";
      }, 700);
      const start = selectedValue ? options.findIndex((option) => option.value === selectedValue) + 1 : 0;
      const next = [...options.slice(start), ...options.slice(0, start)].findIndex(
        (option) => !option.disabled && option.label.toLocaleLowerCase().startsWith(typeahead.current),
      );
      if (next >= 0) {
        const index = (start + next) % options.length;
        if (open) setActiveIndex(index);
        else {
          const option = options[index];
          if (option) choose(option);
        }
      }
    }
  }

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    function validateRequiredSelection(event: SubmitEvent) {
      if (required && !disabled && !selectedValue) {
        event.preventDefault();
        setValidationMessage("Please select an option.");
        showOptions();
        triggerRef.current?.focus();
      }
    }
    form.addEventListener("submit", validateRequiredSelection, true);
    return () => form.removeEventListener("submit", validateRequiredSelection, true);
  }, [disabled, required, selectedValue]);

  useEffect(() => {
    if (open && activeIndex >= 0) {
      document.getElementById(`${listboxId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, listboxId, open]);

  useEffect(() => () => {
    if (typeaheadTimer.current !== null) window.clearTimeout(typeaheadTimer.current);
  }, []);

  return (
    <div ref={rootRef} className={`relative w-full ${className}`}>
      <input
        type="hidden"
        name={name}
        value={selectedValue}
        disabled={disabled}
      />
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-required={required}
        aria-invalid={validationMessage ? true : undefined}
        aria-describedby={validationMessage ? `${listboxId}-error` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : showOptions())}
        onKeyDown={onTriggerKeyDown}
        className="select flex cursor-pointer items-center justify-between gap-3 text-left"
      >
        <span className={selectedOption ? "truncate" : "truncate text-slate-400"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {validationMessage ? <p id={`${listboxId}-error`} role="alert" className="mt-1.5 text-xs text-rose-700">{validationMessage}</p> : null}
      <div
        id={listboxId}
        role="listbox"
        aria-labelledby={id}
        hidden={!open}
        className="absolute z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10"
      >
        {options.map((option, index) => (
          <div
            key={option.value}
            id={`${listboxId}-option-${index}`}
            role="option"
            aria-selected={option.value === selectedValue}
            aria-disabled={option.disabled || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => !option.disabled && setActiveIndex(index)}
            onClick={() => choose(option)}
            className={`flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition ${
              option.disabled
                ? "cursor-not-allowed text-slate-400"
                : activeIndex === index
                  ? "bg-indigo-50 text-indigo-900"
                  : option.value === selectedValue
                    ? "bg-slate-50 text-slate-900"
                    : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span className="truncate">{option.label}</span>
            {option.value === selectedValue ? <Check className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

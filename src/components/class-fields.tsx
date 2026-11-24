"use client";

import { useState } from "react";
import { CLASS_OPTIONS, GROUP_OPTIONS, VERSION_OPTIONS, needsGroup } from "@/lib/student-options";
import { SelectDropdown } from "@/components/select-dropdown";

// Class, medium and (for Class 9 to 12 only) group. The group appears when a class in that range is chosen.
export function ClassFields({
  defaultClass = "",
  defaultVersion = "",
  defaultGroup = "",
}: {
  defaultClass?: string;
  defaultVersion?: string;
  defaultGroup?: string;
}) {
  const [cls, setCls] = useState(defaultClass);
  const showGroup = needsGroup(cls);
  return (
    <>
      <div>
        <label htmlFor="className" className="label">Class</label>
        <SelectDropdown
          id="className"
          name="className"
          required
          value={cls}
          onChange={setCls}
          placeholder="Choose a class"
          options={CLASS_OPTIONS.map((c) => ({ value: c, label: c }))}
        />
      </div>
      <div>
        <label htmlFor="version" className="label">Medium</label>
        <SelectDropdown
          id="version"
          name="version"
          required
          defaultValue={defaultVersion}
          placeholder="Choose a medium"
          options={VERSION_OPTIONS.map((v) => ({ value: v, label: v }))}
        />
      </div>
      {showGroup ? (
        <div>
          <label htmlFor="studentGroup" className="label">Group</label>
          <SelectDropdown
            id="studentGroup"
            name="studentGroup"
            required
            defaultValue={defaultGroup}
            placeholder="Choose a group"
            options={GROUP_OPTIONS.map((g) => ({ value: g, label: g }))}
          />
          <p className="mt-1.5 text-xs text-slate-500">Needed for Class 9 to 12.</p>
        </div>
      ) : null}
    </>
  );
}

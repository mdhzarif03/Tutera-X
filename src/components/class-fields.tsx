"use client";

import { useState } from "react";
import { CLASS_OPTIONS, GROUP_OPTIONS, VERSION_OPTIONS, needsGroup } from "@/lib/student-options";

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
        <select id="className" name="className" required value={cls} onChange={(e) => setCls(e.target.value)} className="select">
          <option value="" disabled>Choose a class</option>
          {CLASS_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="version" className="label">Medium</label>
        <select id="version" name="version" required defaultValue={defaultVersion || ""} className="select">
          <option value="" disabled>Choose a medium</option>
          {VERSION_OPTIONS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>
      {showGroup ? (
        <div>
          <label htmlFor="studentGroup" className="label">Group</label>
          <select id="studentGroup" name="studentGroup" required defaultValue={defaultGroup || ""} className="select">
            <option value="" disabled>Choose a group</option>
            {GROUP_OPTIONS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-500">Needed for Class 9 to 12.</p>
        </div>
      ) : null}
    </>
  );
}

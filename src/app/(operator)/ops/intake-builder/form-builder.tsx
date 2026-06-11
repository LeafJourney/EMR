"use client";

import { useState, useMemo, useCallback } from "react";
import {
  FIELD_TYPES,
  DEFAULT_INTAKE_TEMPLATE,
  type IntakeField,
  type IntakeFieldType,
  type IntakeFormTemplate,
} from "@/lib/domain/intake-builder";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

export function FormBuilder() {
  const [template, setTemplate] = useState<IntakeFormTemplate>(
    () => structuredClone(DEFAULT_INTAKE_TEMPLATE),
  );
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [showAddField, setShowAddField] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSectionManager, setShowSectionManager] = useState(false);
  const [saved, setSaved] = useState(false);

  const selectedField = useMemo(
    () => template.fields.find((f) => f.id === selectedFieldId) ?? null,
    [template.fields, selectedFieldId],
  );

  const fieldsBySection = useMemo(() => {
    const map = new Map<string, IntakeField[]>();
    for (const section of template.sections) {
      map.set(
        section.id,
        template.fields.filter((f) => f.section === section.id).sort((a, b) => a.order - b.order),
      );
    }
    return map;
  }, [template]);

  const sectionCount = template.sections.length;
  const fieldCount = template.fields.length;

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const updateField = useCallback(
    (fieldId: string, updates: Partial<IntakeField>) => {
      setTemplate((prev) => ({
        ...prev,
        fields: prev.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)),
        updatedAt: new Date().toISOString().slice(0, 10),
      }));
    },
    [],
  );

  const deleteField = useCallback(
    (fieldId: string) => {
      setTemplate((prev) => ({
        ...prev,
        fields: prev.fields.filter((f) => f.id !== fieldId),
        updatedAt: new Date().toISOString().slice(0, 10),
      }));
      setSelectedFieldId(null);
      setShowDeleteConfirm(false);
    },
    [],
  );

  const addField = useCallback(
    (type: IntakeFieldType) => {
      const targetSection = template.sections[0].id;
      const existingInSection = template.fields.filter((f) => f.section === targetSection);
      const newField: IntakeField = {
        id: `f-${Date.now()}`,
        type,
        label: `New ${FIELD_TYPES[type].label.toLowerCase()} field`,
        required: false,
        section: targetSection,
        order: existingInSection.length + 1,
        ...(FIELD_TYPES[type].hasOptions ? { options: ["Option 1", "Option 2"] } : {}),
      };
      setTemplate((prev) => ({
        ...prev,
        fields: [...prev.fields, newField],
        updatedAt: new Date().toISOString().slice(0, 10),
      }));
      setSelectedFieldId(newField.id);
      setShowAddField(false);
    },
    [template.sections, template.fields],
  );

  const addSection = useCallback(() => {
    const newId = `section-${Date.now()}`;
    setTemplate((prev) => ({
      ...prev,
      sections: [...prev.sections, { id: newId, title: "New section" }],
      updatedAt: new Date().toISOString().slice(0, 10),
    }));
  }, []);

  const renameSection = useCallback((sectionId: string, title: string) => {
    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === sectionId ? { ...s, title } : s)),
      updatedAt: new Date().toISOString().slice(0, 10),
    }));
  }, []);

  const moveSection = useCallback((sectionId: string, direction: "up" | "down") => {
    setTemplate((prev) => {
      const idx = prev.sections.findIndex((s) => s.id === sectionId);
      if (idx === -1) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.sections.length) return prev;
      const next = [...prev.sections];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return { ...prev, sections: next, updatedAt: new Date().toISOString().slice(0, 10) };
    });
  }, []);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    setTemplate(structuredClone(DEFAULT_INTAKE_TEMPLATE));
    setSelectedFieldId(null);
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <Card tone="raised">
        <CardContent className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Input
              value={template.name}
              onChange={(e) =>
                setTemplate((prev) => ({ ...prev, name: e.target.value }))
              }
              className="font-medium text-text border-transparent hover:border-border-strong focus:border-accent bg-transparent px-0 h-auto text-base"
            />
            <Input
              value={template.description}
              onChange={(e) =>
                setTemplate((prev) => ({ ...prev, description: e.target.value }))
              }
              className="text-text-muted border-transparent hover:border-border-strong focus:border-accent bg-transparent px-0 h-auto text-sm mt-1"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge tone="neutral">
              {fieldCount} fields across {sectionCount} sections
            </Badge>
            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAddField((s) => !s)}
              >
                + Add new
              </Button>
              {showAddField && (
                <div className="absolute right-0 top-full mt-2 z-50 bg-surface border border-border rounded-lg shadow-lg p-2 w-56 max-h-72 overflow-y-auto">
                  {(Object.entries(FIELD_TYPES) as [IntakeFieldType, (typeof FIELD_TYPES)[IntakeFieldType]][]).map(
                    ([type, meta]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => addField(type)}
                        className="flex items-center gap-3 w-full px-3 py-2 text-sm text-text hover:bg-surface-muted rounded-md transition-colors text-left"
                      >
                        <span className="h-6 w-6 rounded bg-surface-muted flex items-center justify-center text-xs font-mono text-text-muted shrink-0">
                          {meta.icon}
                        </span>
                        {meta.label}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSectionManager((s) => !s)}
            >
              Sections
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section manager overlay */}
      {showSectionManager && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Manage sections</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowSectionManager(false)}>
              Done
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {template.sections.map((section, idx) => (
                <li key={section.id} className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, "up")}
                      disabled={idx === 0}
                      className="text-text-muted hover:text-text disabled:opacity-30"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 8l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, "down")}
                      disabled={idx === template.sections.length - 1}
                      className="text-text-muted hover:text-text disabled:opacity-30"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </div>
                  <Input
                    value={section.title}
                    onChange={(e) => renameSection(section.id, e.target.value)}
                    className="flex-1 h-8 text-sm"
                  />
                  <span className="text-xs text-text-subtle shrink-0">
                    {fieldsBySection.get(section.id)?.length ?? 0} fields
                  </span>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" className="mt-3" onClick={addSection}>
              + Add section
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Main content: form preview + field editor */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left panel: Form preview (60%) */}
        <div className="lg:col-span-3 space-y-4">
          {template.sections.map((section) => {
            const fields = fieldsBySection.get(section.id) ?? [];
            const isCollapsed = collapsedSections.has(section.id);

            return (
              <Card key={section.id}>
                <CardHeader className="pb-2">
                  <button
                    type="button"
                    className="flex items-center justify-between w-full"
                    onClick={() => toggleSection(section.id)}
                  >
                    <div className="flex items-center gap-2">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        className={cn(
                          "text-text-muted transition-transform",
                          !isCollapsed && "rotate-90",
                        )}
                      >
                        <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <CardTitle className="text-base">{section.title}</CardTitle>
                    </div>
                    <span className="text-xs text-text-subtle">{fields.length} fields</span>
                  </button>
                  {section.description && !isCollapsed && (
                    <CardDescription className="ml-6">{section.description}</CardDescription>
                  )}
                </CardHeader>
                {!isCollapsed && (
                  <CardContent>
                    {fields.length === 0 ? (
                      <p className="text-sm text-text-muted py-3 text-center">
                        No fields in this section
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {fields.map((field) => {
                          const meta = FIELD_TYPES[field.type];
                          const isSelected = selectedFieldId === field.id;
                          return (
                            <li key={field.id}>
                              <button
                                type="button"
                                onClick={() => setSelectedFieldId(field.id)}
                                className={cn(
                                  "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-all",
                                  isSelected
                                    ? "bg-accent/10 ring-1 ring-accent"
                                    : "hover:bg-surface-muted",
                                )}
                              >
                                {/* Drag handle */}
                                <span className="text-text-subtle shrink-0 cursor-grab">
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="4" cy="3" r="1" fill="currentColor" /><circle cx="8" cy="3" r="1" fill="currentColor" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="8" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="9" r="1" fill="currentColor" /><circle cx="8" cy="9" r="1" fill="currentColor" /></svg>
                                </span>
                                {/* Type icon */}
                                <span className="h-6 w-6 rounded bg-surface-muted flex items-center justify-center text-[10px] font-mono text-text-muted shrink-0">
                                  {meta.icon}
                                </span>
                                {/* Label */}
                                <span className="text-sm text-text flex-1 truncate">
                                  {field.label}
                                </span>
                                {/* Required indicator */}
                                {field.required && (
                                  <span className="text-red-500 text-xs shrink-0">*</span>
                                )}
                                {/* Type badge */}
                                <Badge tone="neutral" className="shrink-0">
                                  {meta.label}
                                </Badge>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {/* Right panel: Field editor (40%) */}
        <div className="lg:col-span-2">
          {selectedField ? (
            <Card tone="raised" className="sticky top-6">
              <CardHeader>
                <CardTitle className="text-base">Edit field</CardTitle>
                <CardDescription>
                  {FIELD_TYPES[selectedField.type].label} field
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Label */}
                <div>
                  <Label htmlFor="field-label">Label</Label>
                  <Input
                    id="field-label"
                    value={selectedField.label}
                    onChange={(e) =>
                      updateField(selectedField.id, { label: e.target.value })
                    }
                  />
                </div>

                {/* Type */}
                <div>
                  <Label htmlFor="field-type">Field type</Label>
                  <select
                    id="field-type"
                    value={selectedField.type}
                    onChange={(e) => {
                      const newType = e.target.value as IntakeFieldType;
                      const updates: Partial<IntakeField> = { type: newType };
                      if (FIELD_TYPES[newType].hasOptions && !selectedField.options) {
                        updates.options = ["Option 1", "Option 2"];
                      }
                      updateField(selectedField.id, updates);
                    }}
                    className="flex w-full rounded-md border border-border-strong bg-surface px-3 h-10 text-sm text-text transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  >
                    {(Object.entries(FIELD_TYPES) as [IntakeFieldType, (typeof FIELD_TYPES)[IntakeFieldType]][]).map(
                      ([type, meta]) => (
                        <option key={type} value={type}>
                          {meta.icon} {meta.label}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                {/* Required toggle */}
                <div className="flex items-center justify-between">
                  <Label className="mb-0">Required</Label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={selectedField.required}
                    onClick={() =>
                      updateField(selectedField.id, {
                        required: !selectedField.required,
                      })
                    }
                    className={cn(
                      "relative h-6 w-11 rounded-full transition-colors",
                      selectedField.required ? "bg-emerald-600" : "bg-gray-300",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                        selectedField.required && "translate-x-5",
                      )}
                    />
                  </button>
                </div>

                {/* Placeholder */}
                <div>
                  <Label htmlFor="field-placeholder">Placeholder</Label>
                  <Input
                    id="field-placeholder"
                    value={selectedField.placeholder ?? ""}
                    onChange={(e) =>
                      updateField(selectedField.id, {
                        placeholder: e.target.value || undefined,
                      })
                    }
                    placeholder="Optional placeholder text"
                  />
                </div>

                {/* Help text */}
                <div>
                  <Label htmlFor="field-help">Help text</Label>
                  <Textarea
                    id="field-help"
                    rows={2}
                    value={selectedField.helpText ?? ""}
                    onChange={(e) =>
                      updateField(selectedField.id, {
                        helpText: e.target.value || undefined,
                      })
                    }
                    placeholder="Additional guidance shown below the field"
                  />
                </div>

                {/* Options editor (for select/radio/multi_select) */}
                {FIELD_TYPES[selectedField.type].hasOptions && (
                  <div>
                    <Label>Options</Label>
                    <div className="space-y-2 mt-1">
                      {(selectedField.options ?? []).map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            value={opt}
                            onChange={(e) => {
                              const newOpts = [...(selectedField.options ?? [])];
                              newOpts[idx] = e.target.value;
                              updateField(selectedField.id, { options: newOpts });
                            }}
                            className="flex-1 h-8 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newOpts = (selectedField.options ?? []).filter(
                                (_, i) => i !== idx,
                              );
                              updateField(selectedField.id, { options: newOpts });
                            }}
                            className="text-text-subtle hover:text-red-500 transition-colors shrink-0"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                          </button>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newOpts = [
                            ...(selectedField.options ?? []),
                            `Option ${(selectedField.options?.length ?? 0) + 1}`,
                          ];
                          updateField(selectedField.id, { options: newOpts });
                        }}
                      >
                        + Add option
                      </Button>
                    </div>
                  </div>
                )}

                {/* Delete button */}
                <div className="pt-3 border-t border-border/60">
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-red-600 flex-1">Delete this field?</p>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => deleteField(selectedField.id)}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDeleteConfirm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      Delete field
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card tone="outlined">
              <CardContent className="py-12 text-center">
                <p className="text-sm text-text-muted">
                  Select a field from the left panel to edit its properties
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <Card tone="raised">
        <CardContent className="py-4 flex items-center justify-between">
          <Button variant="ghost" onClick={handleReset}>
            Reset to default
          </Button>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-sm text-emerald-600 font-medium">Template saved!</span>
            )}
            <Button onClick={handleSave}>Save template</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

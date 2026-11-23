'use client';
import { useState } from 'react';

type Tag = { id: string; name: string };
const technologyNames = new Set([
  'endpoint',
  'security',
  'networking',
  'firewall',
  'wi-fi',
  'microsoft 365',
  'windows',
  'linux',
  'servers',
  'virtualization',
  'backup',
  'storage',
  'cloud',
  'database',
  'printing',
  'voip',
]);
function readTags(value: unknown): Tag[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Tag =>
      !!item &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      item.name.trim().length > 0,
  );
}
function tagTone(name: string) {
  const label = name.toLowerCase();
  if (/security|firewall|data loss/.test(label)) return 'red';
  if (/endpoint|windows|linux|remote support/.test(label)) return 'green';
  if (/cloud|microsoft|network|wi-fi|voip/.test(label)) return 'blue';
  if (/backup|storage|virtual|database|servers/.test(label)) return 'purple';
  if (/printing|hardware|onsite|warranty|vendor/.test(label)) return 'orange';
  const tones = ['blue', 'purple', 'green', 'orange'];
  return tones[
    Array.from(label).reduce((total, char) => total + char.charCodeAt(0), 0) %
      tones.length
  ];
}
function TagChip({ name }: { name: string }) {
  return (
    <span className={`technology-tag technology-tag-${tagTone(name)}`}>
      {name}
    </span>
  );
}
export default function TicketTags({ tags }: { tags: unknown }) {
  const values = readTags(tags);
  return values.length ? (
    <div className="technology-tags" aria-label="Ticket tags">
      {values.map((tag) => (
        <TagChip key={tag.id} name={tag.name} />
      ))}
    </div>
  ) : (
    <span className="technology-tags-empty">No tags</span>
  );
}
export function TagPicker({
  options,
  selected,
  onChange,
  disabled = false,
}: {
  options: unknown;
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const tags = readTags(options);
  const groups = [
    {
      name: 'Technology tags',
      values: tags.filter((tag) => technologyNames.has(tag.name.toLowerCase())),
    },
    {
      name: 'Service tags',
      values: tags.filter(
        (tag) => !technologyNames.has(tag.name.toLowerCase()),
      ),
    },
  ];
  return (
    <div className="technology-tag-picker">
      {groups
        .filter((group) => group.values.length)
        .map((group) => (
          <details key={group.name} className="tag-select-dropdown">
            <summary>
              <span>{group.name}</span>
              <span className="tag-selected-count">
                {group.values.filter((tag) => selected.includes(tag.id)).length}{' '}
                selected
              </span>
              <span className="expandable-chevron" aria-hidden="true" />
            </summary>
            <fieldset disabled={disabled}>
              <legend className="compact-sr-only">{group.name}</legend>
              <div className="technology-tag-options">
                {group.values.map((tag) => (
                  <label key={tag.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(tag.id)}
                      onChange={(event) =>
                        onChange(
                          event.target.checked
                            ? [...selected, tag.id]
                            : selected.filter((id) => id !== tag.id),
                        )
                      }
                    />
                    <TagChip name={tag.name} />
                  </label>
                ))}
              </div>
            </fieldset>
          </details>
        ))}
      {!tags.length ? (
        <p className="hint">
          No tags are available. An administrator can add them in Tags.
        </p>
      ) : null}
    </div>
  );
}
export function TicketTagEditor({
  tags,
  options,
  disabled,
  onSave,
}: {
  tags: unknown;
  options: unknown;
  disabled: boolean;
  onSave: (ids: string[]) => Promise<boolean>;
}) {
  const saved = readTags(tags);
  const [selected, setSelected] = useState(saved.map((tag) => tag.id));
  const available = readTags(options);
  const merged = [
    ...available,
    ...saved.filter((tag) => !available.some((item) => item.id === tag.id)),
  ];
  const changed =
    [...selected].sort().join(',') !==
    saved
      .map((tag) => tag.id)
      .sort()
      .join(',');
  return (
    <>
      <p className="hint">Choose technology and service tags, then save.</p>
      <TagPicker
        options={merged}
        selected={selected}
        onChange={setSelected}
        disabled={disabled}
      />
      <button
        type="button"
        className="secondary full"
        disabled={disabled || !changed}
        onClick={() => void onSave(selected)}
      >
        Save tags
      </button>
    </>
  );
}

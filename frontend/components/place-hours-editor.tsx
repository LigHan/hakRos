import { Ionicons } from '@expo/vector-icons';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { WorkingHours } from '@/constants/content';

const daysOfWeek = [
  ['Пн', 'Понедельник'], ['Вт', 'Вторник'], ['Ср', 'Среда'], ['Чт', 'Четверг'],
  ['Пт', 'Пятница'], ['Сб', 'Суббота'], ['Вс', 'Воскресенье'],
];
const allDays = daysOfWeek.map((_, day) => day);
const workdays = allDays.slice(0, 5);
const weekend = allDays.slice(5);
const hours = Array.from({ length: 24 }, (_, value) => value);
const minutes = Array.from({ length: 60 }, (_, value) => value);
const modes = [
  { value: 'hours', label: 'По часам' },
  { value: 'all-day', label: 'Круглосуточно' },
  { value: 'closed', label: 'Закрыто' },
] as const;

type Schedule = {
  days: number[];
  mode: typeof modes[number]['value'];
  from: number | null;
  to: number | null;
};
type TimeBoundary = 'from' | 'to';

const pad = (value: number) => String(value).padStart(2, '0');
const formatTime = (value: number) => `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;

function readDays(label: string): number[] {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'ежедневно') return allDays;
  if (normalized === 'будни') return workdays;
  if (normalized === 'выходные') return weekend;

  const selected = new Set<number>();
  for (const segment of normalized.split(',')) {
    const range = segment.split(/[-–—]/).map(part =>
      daysOfWeek.findIndex(names => names.some(name => name.toLowerCase() === part.trim().replace(/\.$/, '')))
    );
    const [first, last = first] = range;
    if (range.length > 2 || first < 0 || last < 0) return [];

    const length = (last - first + 7) % 7;
    for (let offset = 0; offset <= length; offset++) selected.add((first + offset) % 7);
  }
  return allDays.filter(day => selected.has(day));
}

function readTime(value: string, end = false) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (end && value === '24:00') return 0;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function readSchedule(row?: WorkingHours): Schedule {
  const base: Schedule = { days: row ? readDays(row.label) : [], from: 9 * 60, to: 18 * 60, mode: 'hours' };
  if (!row) return base;
  const value = row.value.trim().toLowerCase();
  if (value === 'круглосуточно' || /^0?0:00\s*[-–—]\s*24:00$/.test(value)) return { ...base, mode: 'all-day' };
  if (value === 'закрыто' || value === 'выходной') return { ...base, mode: 'closed' };

  const times = value.split(/\s*[-–—]\s*/);
  if (times.length !== 2) return { ...base, from: null, to: null };
  return { ...base, from: readTime(times[0]), to: readTime(times[1], true) };
}

function formatDays(days: number[]) {
  if (days.length === 7) return 'Ежедневно';
  const ranges: string[] = [];
  for (let start = 0; start < days.length;) {
    let end = start;
    while (days[end + 1] === days[end] + 1) end++;
    const first = daysOfWeek[days[start]][0];
    const last = daysOfWeek[days[end]][0];
    ranges.push(start === end ? first : `${first}–${last}`);
    start = end + 1;
  }
  return ranges.join(', ');
}

function Choice({ label, name = label, selected, onPress, role = 'radio' }: {
  label: string;
  name?: string;
  selected: boolean;
  onPress: () => void;
  role?: 'checkbox' | 'radio';
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={name}
      aria-checked={selected}
      onPress={onPress}
      style={[styles.choice, role === 'checkbox' && styles.dayChoice, selected && styles.selected]}
    >
      <Text style={[styles.choiceText, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

const optionHeight = 44;

function TimeOptions({ title, options, value, onChange }: {
  title: string;
  options: number[];
  value: number;
  onChange: (value: number) => void;
}) {
  const list = useRef<ComponentRef<typeof ScrollView>>(null);
  const positioned = useRef(false);

  return (
    <View style={styles.timeColumn} accessibilityRole="radiogroup" accessibilityLabel={title}>
      <Text style={styles.label}>{title}</Text>
      <ScrollView
        ref={list}
        style={styles.timeList}
        nestedScrollEnabled
        onContentSizeChange={() => {
          if (positioned.current) return;
          list.current?.scrollTo({ y: Math.max(0, value - 1) * optionHeight, animated: false });
          positioned.current = true;
        }}
      >
        {options.map(option => (
          <Choice
            key={option}
            label={pad(option)}
            name={title + ' ' + pad(option)}
            selected={option === value}
            onPress={() => onChange(option)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function SchedulePicker({ row, onApply, onCancel, onRemove }: {
  row?: WorkingHours;
  onApply: (row: WorkingHours) => void;
  onCancel: () => void;
  onRemove?: () => void;
}) {
  const [schedule, setSchedule] = useState(() => readSchedule(row));
  const [boundary, setBoundary] = useState<TimeBoundary | null>(null);
  const { days, mode, from, to } = schedule;
  const hasTimes = from !== null && to !== null;
  const timeRange = hasTimes && from !== to ? `${formatTime(from)}–${formatTime(to)}` : null;
  const value = mode === 'hours' ? timeRange : modes.find(option => option.value === mode)?.label;
  const canApply = days.length > 0 && Boolean(value);
  const activeTime = boundary ? (schedule[boundary] ?? (boundary === 'from' ? 9 : 18) * 60) : 0;

  const toggleDay = (day: number) => setSchedule(current => ({
    ...current,
    days: allDays.filter(index => index === day ? !current.days.includes(index) : current.days.includes(index)),
  }));

  const updateTime = (value: number) => {
    if (boundary) setSchedule(current => ({ ...current, [boundary]: value }));
  };

  const apply = () => {
    if (!canApply || !value) return;
    onApply({ label: formatDays(days), value });
  };

  return (
    <View style={styles.picker}>
      <Text style={styles.label}>Дни недели</Text>
      <View style={styles.week}>
        {daysOfWeek.map(([short, full], day) => (
          <Choice
            key={short}
            role="checkbox"
            label={short}
            name={full}
            selected={days.includes(day)}
            onPress={() => toggleDay(day)}
          />
        ))}
      </View>
      <View style={styles.row}>
        {[{ label: 'Будни', days: workdays }, { label: 'Выходные', days: weekend }, { label: 'Все дни', days: allDays }].map(preset => (
          <Pressable
            key={preset.label}
            accessibilityRole="button"
            onPress={() => setSchedule(current => ({ ...current, days: preset.days }))}
            style={styles.shortcut}
          >
            <Text style={styles.shortcutText}>{preset.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Режим работы">
        {modes.map(option => (
          <Choice
            key={option.value}
            label={option.label}
            selected={mode === option.value}
            onPress={() => {
              setSchedule(current => ({ ...current, mode: option.value }));
              setBoundary(null);
            }}
          />
        ))}
      </View>
      {mode === 'hours' && (
        <>
          <View style={styles.times}>
            {([{ key: 'from', label: 'Открытие' }, { key: 'to', label: 'Закрытие' }] as const).map(option => {
              const time = schedule[option.key];
              const timeLabel = time === null ? 'Выбрать' : formatTime(time);
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityLabel={option.label + ', ' + timeLabel}
                  aria-expanded={boundary === option.key}
                  onPress={() => setBoundary(current => current === option.key ? null : option.key)}
                  style={[styles.timeField, boundary === option.key && styles.activeField]}
                >
                  <View>
                    <Text style={styles.hint}>{option.label}</Text>
                    <Text style={styles.timeText}>{timeLabel}</Text>
                  </View>
                  <Ionicons name={boundary === option.key ? 'chevron-up' : 'chevron-down'} size={16} color="#2563eb" />
                </Pressable>
              );
            })}
          </View>
          {boundary && (
            <View key={boundary} style={styles.times}>
              <TimeOptions title="Часы" options={hours} value={Math.floor(activeTime / 60)}
                onChange={hour => updateTime(hour * 60 + activeTime % 60)} />
              <TimeOptions title="Минуты" options={minutes} value={activeTime % 60}
                onChange={minute => updateTime(Math.floor(activeTime / 60) * 60 + minute)} />
            </View>
          )}
          {hasTimes && from === to && <Text style={styles.hint}>Выберите разное время открытия и закрытия.</Text>}
          {hasTimes && to < from && <Text style={styles.hint}>Закрытие на следующий день</Text>}
        </>
      )}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          disabled={!canApply}
          onPress={apply}
          style={[styles.apply, !canApply && styles.disabled]}
        >
          <Text style={styles.applyText}>Применить</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.shortcut}>
          <Text style={styles.shortcutText}>Отмена расписания</Text>
        </Pressable>
        {onRemove && (
          <Pressable accessibilityRole="button" onPress={onRemove} style={styles.shortcut}>
            <Text style={styles.removeText}>Удалить строку</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function PlaceHoursEditor({ rows, activeIndex, disabled, onEdit, onChange }: {
  rows: WorkingHours[];
  activeIndex: number | null;
  disabled: boolean;
  onEdit: (index: number | null) => void;
  onChange: (rows: WorkingHours[]) => void;
}) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>Часы работы</Text>
      {rows.map((row, index) => (
        <View key={index} style={styles.slot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={row.label + ', ' + row.value}
            aria-expanded={activeIndex === index}
            disabled={disabled || (activeIndex !== null && activeIndex !== index)}
            onPress={() => onEdit(activeIndex === index ? null : index)}
            style={styles.summary}
          >
            <View style={styles.summaryText}>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={styles.hint}>{row.value}</Text>
            </View>
            <Ionicons name={activeIndex === index ? 'chevron-up' : 'chevron-down'} size={18} color="#2563eb" />
          </Pressable>
          {activeIndex === index && (
            <SchedulePicker
              row={row}
              onApply={updated => onChange(rows.map((slot, slotIndex) => slotIndex === index ? updated : slot))}
              onCancel={() => onEdit(null)}
              onRemove={() => onChange(rows.filter((_, slotIndex) => slotIndex !== index))}
            />
          )}
        </View>
      ))}
      {activeIndex === rows.length ? (
        <SchedulePicker onApply={row => onChange([...rows, row])} onCancel={() => onEdit(null)} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Добавить часы"
          disabled={disabled || activeIndex !== null || rows.length >= 30}
          onPress={() => onEdit(rows.length)}
          style={[styles.add, (disabled || activeIndex !== null || rows.length >= 30) && styles.disabled]}
        >
          <Ionicons name="add" size={18} color="#1d4ed8" />
          <Text style={styles.shortcutText}>Добавить часы</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#e2e8f0', paddingTop: 14 },
  title: { color: '#0f172a', fontSize: 18, fontWeight: '700' },
  slot: { gap: 8 },
  summary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    minHeight: 54, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, backgroundColor: '#f8fafc',
  },
  summaryText: { flexShrink: 1, gap: 2 },
  label: { color: '#0f172a', fontSize: 14, fontWeight: '600' },
  hint: { color: '#475569', fontSize: 13 },
  picker: { padding: 12, gap: 10, borderRadius: 14, borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#f8fafc' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  week: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  choice: {
    minHeight: optionHeight, minWidth: 36, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 7, borderRadius: 10, backgroundColor: '#eff3f8',
  },
  dayChoice: { minWidth: 34, paddingHorizontal: 5 },
  choiceText: { color: '#0f172a', fontSize: 13, fontWeight: '600' },
  selected: { backgroundColor: '#2563eb' },
  selectedText: { color: '#ffffff' },
  shortcut: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 6 },
  shortcutText: { color: '#1d4ed8', fontSize: 13, fontWeight: '700' },
  removeText: { color: '#b42318', fontSize: 13, fontWeight: '600' },
  times: { flexDirection: 'row', gap: 8 },
  timeField: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 4, padding: 8, borderWidth: 1, borderRadius: 10, borderColor: '#e2e8f0', backgroundColor: '#ffffff',
  },
  activeField: { borderColor: '#2563eb' },
  timeText: { color: '#0f172a', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  timeColumn: { flex: 1, gap: 4 },
  timeList: { height: optionHeight * 3, borderWidth: 1, borderRadius: 10, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  add: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: 44,
    gap: 5, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#dbeafe',
  },
  apply: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#2563eb' },
  applyText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.55 },
});

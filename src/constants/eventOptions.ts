// Age range constants
export const AGE_MIN = 18;
export const AGE_MAX = 60; // Legacy preset bounds; do not reinterpret saved groups.
export const PLAN_AGE_MAX = 99;
export const PLAN_AGE_MIN_GAP = 5;

// Option arrays
export const groupOptions = ['Single', 'Group'] as const;
export const genderOptions = ['Any', 'Male', 'Female'] as const;

export const ageOptions = [
  { id: 'all', label: 'All ages', min: AGE_MIN, max: AGE_MAX },
  { id: '20s', label: '20s', min: 18, max: 29 },
  { id: '20-25', label: '20-25', min: 20, max: 25 },
  { id: '25-30', label: '25-30', min: 25, max: 30 },
  { id: '30s', label: '30s', min: 30, max: 39 },
  { id: '30-35', label: '30-35', min: 30, max: 35 },
  { id: '35-40', label: '35-40', min: 35, max: 40 },
  { id: '40+', label: '40+', min: 40, max: AGE_MAX },
] as const;

// Types
export type GroupOption = (typeof groupOptions)[number];
export type GenderOption = (typeof genderOptions)[number];
export type DateOption = 'today' | 'tomorrow';
export type AgeOption = { label: string; min: number; max: number };

// Display labels for UI (internal values remain for backend compatibility)
export const groupDisplayLabels: Record<GroupOption, string> = {
  Single: '1:1',
  Group: 'Group',
};

export const genderDisplayLabels: Record<GenderOption, string> = {
  Any: 'All genders',
  Male: 'Male',
  Female: 'Female',
};

// Helper function to get age label from range
export const getAgeLabel = (range: [number, number]): string => {
  const [min, max] = range;
  const match = ageOptions.find((option) => option.min === min && option.max === max);
  if (match) {
    return match.label;
  }
  if (min === AGE_MIN && max === AGE_MAX) {
    return 'All ages';
  }
  return `${min}-${max}`;
};

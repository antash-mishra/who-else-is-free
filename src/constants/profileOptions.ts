export const userGenderOptions = ['Male', 'Female', 'Other'] as const;

export type UserGender = (typeof userGenderOptions)[number];

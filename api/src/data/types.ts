export type WeekStatus = "open" | "locked";

export interface StaffMember {
  id: string;
  name: string;
  number: string;
  title?: string;
  active: boolean;
  roles?: {
    mhfa?: boolean;
    fire?: boolean;
    first?: boolean;
    director?: boolean;
    guest?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRow {
  staffId: string;
  MonAM: string;
  MonPM: string;
  TueAM: string;
  TuePM: string;
  WedAM: string;
  WedPM: string;
  ThuAM: string;
  ThuPM: string;
  FriAM: string;
  FriPM: string;
  comment: string;
  updatedAt: string;
}

export interface WeekRecord {
  week: string;
  status: WeekStatus;
  lockedBy?: string;
  lockedAt?: string;
  unlockedBy?: string;
  unlockedAt?: string;
  updatedAt: string;
}

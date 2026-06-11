import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import {
  getAnalytics,
  logEvent as logAnalyticsEvent,
  setDefaultEventParameters,
} from "@react-native-firebase/analytics";

import { logger } from "./logger";

type AnalyticsParamValue = string | number;

export type AnalyticsParams = Record<
  string,
  AnalyticsParamValue | null | undefined
>;

export type AnalyticsEventName =
  | "login_started"
  | "login_succeeded"
  | "signup_succeeded"
  | "login_failed"
  | "profile_completed"
  | "event_create_started"
  | "event_create_submitted"
  | "event_create_succeeded"
  | "event_create_failed"
  | "join_request_started"
  | "join_request_submitted"
  | "join_request_succeeded"
  | "join_request_failed"
  | "join_request_cancelled"
  | "guest_join_requires_auth"
  | "join_request_approved"
  | "join_request_denied"
  | "message_sent"
  | "message_send_failed"
  | "member_reported"
  | "event_reported";

type EventAnalyticsInput = {
  groupType?: string | null;
  gender?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
  scheduledAt?: string | Date | null;
};

const isAnalyticsEnabled = () => Platform.OS !== "web";

const normalizeParams = (params?: AnalyticsParams) => {
  const normalized: Record<string, AnalyticsParamValue> = {};
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }
    normalized[key] = value;
  });
  return normalized;
};

const logAnalyticsWarning = (message: string, error: unknown) => {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    logger.warn(message, error);
  }
};

export const initializeAnalytics = async () => {
  if (!isAnalyticsEnabled()) {
    return;
  }

  try {
    const analytics = getAnalytics();
    await setDefaultEventParameters(
      analytics,
      normalizeParams({
        platform: Platform.OS,
        app_version: Constants.expoConfig?.version ?? "unknown",
        build_channel: Updates.channel ?? "development",
      }),
    );
  } catch (error) {
    logAnalyticsWarning("Failed to initialize analytics", error);
  }
};

export const trackEvent = async (
  eventName: AnalyticsEventName,
  params?: AnalyticsParams,
) => {
  if (!isAnalyticsEnabled()) {
    return;
  }

  try {
    await logAnalyticsEvent(getAnalytics(), eventName, normalizeParams(params));
  } catch (error) {
    logAnalyticsWarning(`Failed to track analytics event: ${eventName}`, error);
  }
};

export const trackScreenView = async (screenName: string) => {
  if (!isAnalyticsEnabled()) {
    return;
  }

  try {
    await logAnalyticsEvent(getAnalytics(), "screen_view", {
      screen_name: screenName,
      screen_class: screenName,
    });
  } catch (error) {
    logAnalyticsWarning(`Failed to track screen view: ${screenName}`, error);
  }
};

export const getAgeRangeBucket = (
  minAge?: number | null,
  maxAge?: number | null,
) => {
  if (minAge == null || maxAge == null) {
    return "unknown";
  }

  if (minAge <= 13 && maxAge >= 120) {
    return "any";
  }

  const bucketStart = Math.floor(Math.min(minAge, maxAge) / 10) * 10;
  const bucketEnd = Math.floor(Math.max(minAge, maxAge) / 10) * 10;
  return `${bucketStart}s_${bucketEnd}s`;
};

export const getScheduleAnalyticsParams = (
  scheduledAt?: string | Date | null,
): AnalyticsParams => {
  if (!scheduledAt) {
    return {
      scheduled_day_of_week: "unknown",
      scheduled_hour_bucket: "unknown",
    };
  }

  const date =
    scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) {
    return {
      scheduled_day_of_week: "unknown",
      scheduled_hour_bucket: "unknown",
    };
  }

  const hour = date.getHours();
  return {
    scheduled_day_of_week: String(date.getDay()),
    scheduled_hour_bucket: `${hour.toString().padStart(2, "0")}:00`,
  };
};

export const getEventAnalyticsParams = ({
  groupType,
  gender,
  minAge,
  maxAge,
  scheduledAt,
}: EventAnalyticsInput): AnalyticsParams => ({
  group_type: groupType ?? "unknown",
  event_group_type: groupType ?? "unknown",
  gender_preference: gender ?? "unknown",
  age_range_bucket: getAgeRangeBucket(minAge, maxAge),
  ...getScheduleAnalyticsParams(scheduledAt),
});

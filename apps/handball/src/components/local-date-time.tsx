"use client";

import { useMemo } from "react";

const JST_TIME_ZONE = "Asia/Tokyo";

type LocalDateTimeProps = {
  value: Date | string | number;
  className?: string;
  emptyText?: string;
};

type LocalDateTimeRangeProps = {
  startValue: Date | string | number;
  endValue?: Date | string | number | null;
  className?: string;
  emptyText?: string;
};

type LocalDateProps = {
  value: Date | string | number;
  className?: string;
  emptyText?: string;
};

function toValidDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTimeText(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateText(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateKeyText(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: JST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatTimeText(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function LocalDateTime({ value, className, emptyText = "-" }: LocalDateTimeProps) {
  const date = useMemo(() => toValidDate(value), [value]);
  const isClient = typeof window !== "undefined";

  if (!date) {
    return <span className={className}>{emptyText}</span>;
  }

  return (
    <time className={className} dateTime={date.toISOString()} suppressHydrationWarning>
      {isClient
        ? formatDateTimeText(date)
        : ""}
    </time>
  );
}

export function LocalDateTimeRange({ startValue, endValue, className, emptyText = "-" }: LocalDateTimeRangeProps) {
  const startDate = useMemo(() => toValidDate(startValue), [startValue]);
  const endDate = useMemo(() => {
    if (!endValue) {
      return null;
    }
    if (endValue instanceof Date || typeof endValue === "string" || typeof endValue === "number") {
      return toValidDate(endValue);
    }
    return null;
  }, [endValue]);
  const isClient = typeof window !== "undefined";

  if (!startDate) {
    return <span className={className}>{emptyText}</span>;
  }

  if (!endDate) {
    return (
      <time className={className} dateTime={startDate.toISOString()} suppressHydrationWarning>
        {isClient ? formatDateTimeText(startDate) : ""}
      </time>
    );
  }

  const sameDay = formatDateKeyText(startDate) === formatDateKeyText(endDate);

  return (
    <time className={className} dateTime={startDate.toISOString()} suppressHydrationWarning>
      {isClient
        ? sameDay
          ? `${formatDateText(startDate)} ${formatTimeText(startDate)}-${formatTimeText(endDate)}`
          : `${formatDateTimeText(startDate)}-${formatDateTimeText(endDate)}`
        : ""}
    </time>
  );
}

export function LocalDate({ value, className, emptyText = "-" }: LocalDateProps) {
  const date = useMemo(() => toValidDate(value), [value]);
  const isClient = typeof window !== "undefined";

  if (!date) {
    return <span className={className}>{emptyText}</span>;
  }

  return (
    <time className={className} dateTime={date.toISOString()} suppressHydrationWarning>
      {isClient
        ? new Intl.DateTimeFormat("ja-JP", {
          timeZone: JST_TIME_ZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(date)
        : ""}
    </time>
  );
}

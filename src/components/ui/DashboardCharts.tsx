import React, { useState } from 'react';
import { Utensils } from 'lucide-react';

interface BarPoint {
  monthKey: string;
  label: string;
  admissions: number;
  departures: number;
}

export const AdmissionsBarChart: React.FC<{ data: BarPoint[] }> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const rawMax = Math.max(
    5,
    ...data.map((d) => Math.max(d.admissions, d.departures)),
  );
  const step = rawMax <= 10 ? 2 : 5;
  const maxTick = Math.ceil(rawMax / step) * step;
  const ticks = Array.from({ length: 6 }, (_, i) => Math.round((maxTick / 5) * i)).reverse();

  return (
    <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-5 shadow-[0_2px_10px_rgba(0,0,0,0.025)]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929]">
          Student Admissions vs Departures
        </h2>
        <div className="flex items-center gap-5 text-[14px] leading-[1.35] text-[#777777]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#DDF58A] ring-2 ring-[#DDF58A]/35" />
            Admissions
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#CEB5EF] ring-2 ring-[#CEB5EF]/35" />
            Departures
          </span>
        </div>
      </div>

      <div className="relative h-[205px] flex">
        {/* Y-axis labels */}
        <div className="w-9 flex flex-col justify-between pb-6 text-[14px] font-medium leading-[1.35] text-[#777777] text-right pr-2 select-none">
          {ticks.map((t, idx) => (
            <span key={idx}>{t}</span>
          ))}
        </div>

        {/* Plot area */}
        <div className="flex-1 relative flex flex-col">
          <div className="flex-1 relative">
            {/* Horizontal grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              {ticks.map((_, idx) => (
                <div key={idx} className="w-full border-b border-[#EFEFEF]" />
              ))}
            </div>

            {/* Bars */}
            <div className="relative z-10 h-full flex items-end justify-around px-3">
              {data.map((point, idx) => {
                const admHeight = maxTick > 0 ? Math.max(point.admissions > 0 ? 4 : 0, (point.admissions / maxTick) * 100) : 0;
                const depHeight = maxTick > 0 ? Math.max(point.departures > 0 ? 4 : 0, (point.departures / maxTick) * 100) : 0;

                return (
                  <div
                    key={point.monthKey}
                    className="relative h-full flex items-end gap-[5px] px-2 cursor-default"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    {hoveredIdx === idx ? (
                      <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-[#222222] text-white text-[14px] leading-[1.35] rounded-[6px] px-2.5 py-1 whitespace-nowrap z-20 shadow-md pointer-events-none">
                        {point.label}: {point.admissions} in / {point.departures} out
                      </div>
                    ) : null}

                    <div
                      className="w-[8px] rounded-t-[4px] bg-[#DDF58A] transition-all duration-200"
                      style={{ height: `${admHeight}%` }}
                      title={`${point.label} Admissions: ${point.admissions}`}
                    />
                    <div
                      className="w-[8px] rounded-t-[4px] bg-[#CEB5EF] transition-all duration-200"
                      style={{ height: `${depHeight}%` }}
                      title={`${point.label} Departures: ${point.departures}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* X-axis labels */}
          <div className="h-6 flex items-center justify-around px-3">
            {data.map((point) => (
              <span key={point.monthKey} className="text-[14px] font-medium leading-[1.35] text-[#777777] text-center w-10">
                {point.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface DonutProps {
  occupiedBeds: number;
  availableBeds: number;
  occupiedPct: number;
  availablePct: number;
}

export const RoomOccupancyDonut: React.FC<DonutProps> = ({
  occupiedBeds,
  availableBeds,
  occupiedPct,
  availablePct,
}) => {
  const size = 210;
  const cx = size / 2;
  const cy = size / 2;
  const r = 72;
  const circumference = 2 * Math.PI * r;

  const occFrac = Math.max(0, Math.min(100, occupiedPct)) / 100;
  const availFrac = Math.max(0, Math.min(100, availablePct)) / 100;
  const occDash = occFrac * circumference;
  const availDash = availFrac * circumference;

  // Midpoint angles (starting from top -90 deg, clockwise)
  const occMidAngle = (-90 + occFrac * 180) * (Math.PI / 180);
  const availMidAngle = (-90 + occFrac * 360 + availFrac * 180) * (Math.PI / 180);

  const occBadgeX = cx + r * Math.cos(occMidAngle);
  const occBadgeY = cy + r * Math.sin(occMidAngle);
  const availBadgeX = cx + r * Math.cos(availMidAngle);
  const availBadgeY = cy + r * Math.sin(availMidAngle);

  return (
    <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-5 shadow-[0_2px_10px_rgba(0,0,0,0.025)] flex flex-col justify-between h-full">
      <div className="flex items-center justify-between">
        <h2 className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929]">Room Occupancy</h2>
        <span className="text-[14px] leading-[1.35] text-[#777777]">
          {occupiedBeds + availableBeds} Beds
        </span>
      </div>

      <div className="flex items-center justify-center my-3">
        <div className="relative w-[210px] h-[210px]">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="#F4F4F4"
              strokeWidth="28"
            />
            {availFrac > 0 ? (
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="#CEB5EF"
                strokeWidth="28"
                strokeDasharray={`${availDash} ${circumference}`}
                strokeDashoffset={-occDash}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            ) : null}
            {occFrac > 0 ? (
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="#DDF58A"
                strokeWidth="28"
                strokeDasharray={`${occDash} ${circumference}`}
                strokeDashoffset={0}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            ) : null}
          </svg>

          {occupiedPct > 5 ? (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-[#FFFFFF] shadow-[0_2px_8px_rgba(0,0,0,0.14)] flex items-center justify-center text-[14px] font-semibold text-[#292929] border border-[#E9E9E9]/60"
              style={{ left: `${occBadgeX}px`, top: `${occBadgeY}px` }}
            >
              {occupiedPct}%
            </div>
          ) : null}

          {availablePct > 5 ? (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-[#FFFFFF] shadow-[0_2px_8px_rgba(0,0,0,0.14)] flex items-center justify-center text-[14px] font-semibold text-[#292929] border border-[#E9E9E9]/60"
              style={{ left: `${availBadgeX}px`, top: `${availBadgeY}px` }}
            >
              {availablePct}%
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 text-[14px] leading-[1.35] text-[#777777] pt-1">
        <span className="inline-flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#DDF58A] ring-2 ring-[#DDF58A]/40" />
          Occupied ({occupiedBeds})
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#CEB5EF] ring-2 ring-[#CEB5EF]/40" />
          Available ({availableBeds})
        </span>
      </div>
    </div>
  );
};

interface MessGaugeProps {
  totalBookings: number;
  servedCount: number;
  remainingCount: number;
  servedPct: number;
  remainingPct: number;
}

export const MessSemiGauge: React.FC<MessGaugeProps> = ({
  totalBookings,
  servedCount,
  remainingCount,
  servedPct,
  remainingPct,
}) => {
  const r = 68;
  const cx = 105;
  const cy = 96;
  const halfCircumference = Math.PI * r;
  const servedLen = totalBookings > 0 ? (servedPct / 100) * halfCircumference : 0;
  const remainingLen = totalBookings > 0 ? halfCircumference - servedLen : halfCircumference;

  return (
    <div className="bg-[#222222] rounded-[12px] p-5 text-white flex flex-col justify-between h-full">
      <div className="flex items-center justify-between">
        <h2 className="font-slab text-[18px] font-semibold leading-[1.3] text-white">Mess Overview</h2>
        <span className="text-[14px] leading-[1.35] text-[#9A9A9A]">{totalBookings} today</span>
      </div>

      <div className="flex flex-col items-center my-2">
        <div className="relative w-[210px] h-[112px]">
          <svg width="210" height="112" viewBox="0 0 210 112">
            {/* Base arc */}
            <path
              d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
              fill="none"
              stroke={totalBookings > 0 ? '#CEB5EF' : '#3A3A3A'}
              strokeWidth="26"
            />
            {totalBookings > 0 && servedLen > 0 ? (
              <path
                d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                fill="none"
                stroke="#DDF58A"
                strokeWidth="26"
                strokeDasharray={`${servedLen} ${halfCircumference}`}
              />
            ) : null}
          </svg>

          {/* Center icon badge */}
          <div className="absolute left-1/2 bottom-2 -translate-x-1/2 w-11 h-11 rounded-full bg-white flex items-center justify-center shadow-md">
            <Utensils className="w-5 h-5 text-[#292929]" strokeWidth={2} />
          </div>
        </div>

        <div className="w-[180px] flex items-center justify-between text-[14px] font-medium leading-[1.35] text-[#CCCCCC] mt-1">
          <span>{servedPct}%</span>
          <span>{totalBookings > 0 ? `${remainingPct}%` : `${remainingLen > 0 ? 0 : 0}%`}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 text-[14px] leading-[1.35] text-[#CCCCCC] pt-1">
        <span className="inline-flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#DDF58A] ring-2 ring-[#DDF58A]/30" />
          Served ({servedCount})
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#CEB5EF] ring-2 ring-[#CEB5EF]/30" />
          Pending ({remainingCount})
        </span>
      </div>
    </div>
  );
};


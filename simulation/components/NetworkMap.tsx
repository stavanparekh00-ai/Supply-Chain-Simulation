"use client";

import { UsaMapOutline } from "@/components/UsaMapOutline";

interface MapFacility {
  id: string;
  name: string;
  city: string;
  map_x: number;
  map_y: number;
  fixed_cost_to_open: number;
}

interface MapCustomer {
  id: string;
  name: string;
  city: string;
  map_x: number;
  map_y: number;
  weekly_demand: number;
}

/** Decorative reference cities (not playable) so the map reads as a populated US. */
const REFERENCE_CITIES: { name: string; x: number; y: number }[] = [
  { name: "Seattle", x: 108, y: 78 },
  { name: "Portland", x: 95, y: 118 },
  { name: "San Francisco", x: 42, y: 278 },
  { name: "San Diego", x: 95, y: 380 },
  { name: "Las Vegas", x: 135, y: 305 },
  { name: "Boise", x: 155, y: 175 },
  { name: "Albuquerque", x: 245, y: 345 },
  { name: "Minneapolis", x: 525, y: 145 },
  { name: "Omaha", x: 455, y: 225 },
  { name: "Kansas City", x: 485, y: 270 },
  { name: "St. Louis", x: 555, y: 285 },
  { name: "Dallas", x: 445, y: 375 },
  { name: "New Orleans", x: 565, y: 435 },
  { name: "Nashville", x: 640, y: 335 },
  { name: "Milwaukee", x: 600, y: 195 },
  { name: "Cleveland", x: 700, y: 205 },
  { name: "Philadelphia", x: 825, y: 225 },
  { name: "New York", x: 850, y: 195 },
  { name: "Boston", x: 885, y: 155 },
  { name: "Washington", x: 805, y: 255 },
  { name: "Miami", x: 785, y: 495 },
  { name: "Tampa", x: 745, y: 455 },
];

function arrowPoints(x1: number, y1: number, x2: number, y2: number, size = 11) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const tipX = x2 - Math.cos(angle) * 22;
  const tipY = y2 - Math.sin(angle) * 22;
  const leftX = tipX - size * Math.cos(angle - Math.PI / 6);
  const leftY = tipY - size * Math.sin(angle - Math.PI / 6);
  const rightX = tipX - size * Math.cos(angle + Math.PI / 6);
  const rightY = tipY - size * Math.sin(angle + Math.PI / 6);
  return {
    lineEnd: { x: tipX, y: tipY },
    polygon: `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`,
  };
}

function FacilityMarker({
  facility,
  selected,
  onToggle,
}: {
  facility: MapFacility;
  selected: boolean;
  onToggle: () => void;
}) {
  const fill = selected ? "#1e3a5f" : "#ffffff";
  const stroke = "#1e3a5f";
  const detail = selected ? "#dbeafe" : "#1e3a5f";

  return (
    <g
      transform={`translate(${facility.map_x} ${facility.map_y})`}
      onClick={onToggle}
      className="cursor-pointer"
      role="button"
      aria-label={`${selected ? "Close" : "Open"} facility ${facility.id}`}
    >
      {/* Warehouse / distribution hub icon */}
      <g filter="url(#markerShadow)">
        <rect x="-18" y="-14" width="36" height="28" rx="3" fill={fill} stroke={stroke} strokeWidth="2.5" />
        <path
          d="M -18 -8 L 0 -18 L 18 -8"
          fill={fill}
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Dock / bay doors */}
        <rect x="-11" y="-2" width="8" height="12" rx="1" fill={detail} opacity={selected ? 0.9 : 0.2} />
        <rect x="3" y="-2" width="8" height="12" rx="1" fill={detail} opacity={selected ? 0.9 : 0.2} />
        {/* ID badge */}
        <circle cx="14" cy="-14" r="9" fill={selected ? "#0f766e" : "#1e3a5f"} stroke="#fff" strokeWidth="2" />
        <text x="14" y="-10" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">
          {facility.id}
        </text>
      </g>
      <text x="0" y="28" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1e3a5f">
        {facility.name}
      </text>
      <text x="0" y="42" textAnchor="middle" fontSize="11" fill="#475569">
        {facility.city}
      </text>
    </g>
  );
}

function CustomerMarker({ customer }: { customer: MapCustomer }) {
  return (
    <g transform={`translate(${customer.map_x} ${customer.map_y})`}>
      <g filter="url(#markerShadow)">
        {/* Map pin */}
        <path
          d="M 0 -22 C -12 -22 -18 -14 -18 -6 C -18 4 0 22 0 22 C 0 22 18 4 18 -6 C 18 -14 12 -22 0 -22 Z"
          fill="#c2410c"
          stroke="#9a3412"
          strokeWidth="1.5"
        />
        <circle cx="0" cy="-8" r="8" fill="#fff7ed" />
        <text x="0" y="-4" textAnchor="middle" fontSize="9" fontWeight="800" fill="#9a3412">
          {customer.id}
        </text>
      </g>
      <text x="0" y="34" textAnchor="middle" fontSize="11" fontWeight="700" fill="#9a3412">
        {customer.city.split(",")[0]}
      </text>
      <text x="0" y="46" textAnchor="middle" fontSize="10" fill="#7c2d12">
        {customer.name}
      </text>
    </g>
  );
}

export function NetworkMap({
  facilities,
  customers,
  transportCosts,
  selected,
  onToggle,
}: {
  facilities: MapFacility[];
  customers: MapCustomer[];
  transportCosts: Record<string, Record<string, number>>;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const assignments = customers.map((customer) => {
    const selectedFacilities = facilities.filter((f) => selected.has(f.id));
    const facility = [...selectedFacilities].sort((a, b) => {
      const costDiff = transportCosts[a.id][customer.id] - transportCosts[b.id][customer.id];
      if (costDiff !== 0) return costDiff;
      return a.id.localeCompare(b.id);
    })[0];
    return { customer, facility };
  });

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-[var(--card-border)] bg-[#9eb6d1]">
        <svg
          viewBox="0 0 959 593"
          className="block h-auto w-full"
          role="img"
          aria-label="United States map with facilities and customers"
        >
          <defs>
            <filter id="markerShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodOpacity="0.28" />
            </filter>
          </defs>

          <rect width="959" height="593" fill="#9eb6d1" />
          <UsaMapOutline />

          {/* Reference cities — geographic context only */}
          <g aria-hidden="true">
            {REFERENCE_CITIES.map((city) => (
              <g key={city.name} transform={`translate(${city.x} ${city.y})`} opacity="0.55">
                <circle r="2.2" fill="#475569" />
                <text x="5" y="3.5" fontSize="10" fill="#475569" fontWeight="500">
                  {city.name}
                </text>
              </g>
            ))}
          </g>

          {assignments.map(({ customer, facility }) => {
            if (!facility) return null;
            const arrow = arrowPoints(facility.map_x, facility.map_y, customer.map_x, customer.map_y);
            return (
              <g key={`${facility.id}-${customer.id}`} className="map-assignment-flow">
                <line
                  x1={facility.map_x}
                  y1={facility.map_y}
                  x2={arrow.lineEnd.x}
                  y2={arrow.lineEnd.y}
                  stroke="#1e3a5f"
                  strokeWidth="2.4"
                  strokeDasharray="7 5"
                  opacity="0.8"
                />
                <polygon points={arrow.polygon} fill="#1e3a5f" />
              </g>
            );
          })}

          {customers.map((c) => (
            <CustomerMarker key={c.id} customer={c} />
          ))}

          {facilities.map((f) => (
            <FacilityMarker
              key={f.id}
              facility={f}
              selected={selected.has(f.id)}
              onToggle={() => onToggle(f.id)}
            />
          ))}
        </svg>

        {selected.size === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-max rounded border border-[var(--card-border)] bg-white/95 px-3 py-1.5 text-xs text-[var(--slate)] shadow-sm">
            Select warehouse hubs — navy arrows show which customers each one serves
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-[var(--slate)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-4 w-5 items-center justify-center rounded-[2px] bg-[var(--navy)] text-[8px] font-bold text-white">
            F
          </span>
          Open warehouse hub
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-4 w-5 items-center justify-center rounded-[2px] border border-[var(--navy)] bg-white text-[8px] font-bold text-[var(--navy)]">
            F
          </span>
          Candidate hub
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3.5 w-2.5 rounded-t-full rounded-b-[1px] bg-[#c2410c]" />
          Customer plant
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#475569] opacity-60" />
          Reference city
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5 text-[var(--navy)]">
            <span className="w-4 border-t border-dashed border-[var(--navy)]" />
            <span className="text-[9px] leading-none">▶</span>
          </span>
          Serves customer
        </span>
      </div>
    </div>
  );
}

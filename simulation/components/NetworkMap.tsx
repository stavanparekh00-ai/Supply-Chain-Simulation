"use client";

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

function arrowGeometry(x1: number, y1: number, x2: number, y2: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const tipX = x2 - Math.cos(angle) * 3.4;
  const tipY = y2 - Math.sin(angle) * 3.4;
  const size = 2.4;
  const leftX = tipX - size * Math.cos(angle - Math.PI / 7);
  const leftY = tipY - size * Math.sin(angle - Math.PI / 7);
  const rightX = tipX - size * Math.cos(angle + Math.PI / 7);
  const rightY = tipY - size * Math.sin(angle + Math.PI / 7);
  const startX = x1 + Math.cos(angle) * 3.1;
  const startY = y1 + Math.sin(angle) * 3.1;
  return {
    startX,
    startY,
    tipX,
    tipY,
    polygon: `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`,
  };
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
  const activeAssignments = assignments.filter((a) => a.facility);

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-[var(--card-border)] bg-[#f4f7fb]">
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--card-border)] bg-white/90 px-3 py-2 backdrop-blur">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--navy)]">
            Network map
          </div>
          <div className="text-[11px] text-[var(--slate)]">
            {selected.size === 0
              ? "Select hubs to draw service arrows"
              : `${activeAssignments.length} customer${activeAssignments.length === 1 ? "" : "s"} assigned · arrows show facility → customer`}
          </div>
        </div>

        <svg viewBox="0 0 100 96" className="mt-8 block h-auto w-full" role="img" aria-label="Facility and customer network map with assignment arrows">
          <defs>
            <linearGradient id="mapBackground" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="55%" stopColor="#eef3f8" />
              <stop offset="100%" stopColor="#e4ebf3" />
            </linearGradient>
            <pattern id="mapGrid" width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M 8 0 L 0 0 0 8" fill="none" stroke="#dbe3ee" strokeWidth="0.28" />
            </pattern>
            <filter id="markerShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0.8" stdDeviation="0.8" floodOpacity="0.18" />
            </filter>
          </defs>

          <rect width="100" height="96" fill="url(#mapBackground)" />
          <rect width="100" height="96" fill="url(#mapGrid)" opacity="0.65" />
          <path
            d="M5 28 L13 15 L27 13 L38 18 L48 16 L58 22 L67 19 L80 23 L93 33 L89 45 L93 54 L86 69 L80 72 L75 86 L64 82 L56 88 L44 83 L34 85 L28 75 L17 72 L12 61 L6 52 Z"
            fill="#fff"
            stroke="#c9d3e0"
            strokeWidth="0.75"
          />

          {assignments.map(({ customer, facility }) => {
            if (!facility) return null;
            const arrow = arrowGeometry(facility.map_x, facility.map_y + 2, customer.map_x, customer.map_y + 2);
            return (
              <g key={`${facility.id}-${customer.id}`} className="map-assignment-flow">
                <line
                  x1={arrow.startX}
                  y1={arrow.startY}
                  x2={arrow.tipX}
                  y2={arrow.tipY}
                  stroke="#0f766e"
                  strokeWidth="1.15"
                  strokeLinecap="round"
                  opacity="0.9"
                />
                <polygon points={arrow.polygon} fill="#0f766e" />
              </g>
            );
          })}

          {customers.map((c) => (
            <g key={c.id} transform={`translate(${c.map_x} ${c.map_y + 2})`}>
              <circle r="2.6" fill="#fff" stroke="#b45309" strokeWidth="1" filter="url(#markerShadow)" />
              <circle r="0.85" fill="#b45309" />
              <text x="3.4" y="-1.1" fontSize="2.7" fontWeight="700" fill="#334155">
                {c.id}
              </text>
              <text x="3.4" y="2.1" fontSize="2.05" fill="#64748b">
                {c.city.split(",")[0]}
              </text>
            </g>
          ))}

          {facilities.map((f) => {
            const isSelected = selected.has(f.id);
            return (
              <g
                key={f.id}
                transform={`translate(${f.map_x} ${f.map_y + 2})`}
                onClick={() => onToggle(f.id)}
                className="cursor-pointer"
                role="button"
                aria-label={`${isSelected ? "Close" : "Open"} facility ${f.id}`}
              >
                <rect
                  x="-3.2"
                  y="-3.2"
                  width="6.4"
                  height="6.4"
                  rx="1.2"
                  fill={isSelected ? "#1e3a5f" : "#fff"}
                  stroke="#1e3a5f"
                  strokeWidth="0.95"
                  filter="url(#markerShadow)"
                />
                <text x="0" y="1.05" textAnchor="middle" fontSize="2.55" fontWeight="800" fill={isSelected ? "#fff" : "#1e3a5f"}>
                  {f.id}
                </text>
                <text x="4.2" y="-0.55" fontSize="2.3" fontWeight="700" fill="#334155">
                  {f.name}
                </text>
                <text x="4.2" y="2.1" fontSize="1.9" fill="#64748b">
                  {f.city}
                </text>
              </g>
            );
          })}
        </svg>

        {selected.size === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-max rounded border border-[var(--card-border)] bg-white/95 px-3 py-1.5 text-xs text-[var(--slate)] shadow-sm">
            Click facilities to open them — teal arrows appear for each served customer
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-[var(--slate)]">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-[var(--navy)]" /> Open facility
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-[var(--navy)] bg-white" /> Candidate facility
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-[var(--amber)] bg-white" /> Customer
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[#0f766e]">
            <span className="w-5 border-t-2 border-[#0f766e]" />
            <span className="text-[10px] leading-none">▶</span>
          </span>
          Facility serves customer
        </span>
      </div>
    </div>
  );
}

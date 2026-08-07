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
    const facility = selectedFacilities.sort(
      (a, b) => transportCosts[a.id][customer.id] - transportCosts[b.id][customer.id]
    )[0];
    return { customer, facility };
  });

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-[var(--card-border)] bg-[#f8fafc]">
        <svg viewBox="0 0 100 92" className="block h-auto w-full" role="img" aria-label="Facility and customer network map">
          <defs>
            <linearGradient id="mapBackground" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#eef2f7" />
            </linearGradient>
            <filter id="markerShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.18" />
            </filter>
          </defs>

          <rect width="100" height="92" fill="url(#mapBackground)" />
          <path
            d="M5 25 L13 12 L27 10 L38 15 L48 13 L58 19 L67 16 L80 20 L93 30 L89 42 L93 51 L86 66 L80 69 L75 83 L64 79 L56 85 L44 80 L34 82 L28 72 L17 69 L12 58 L6 49 Z"
            fill="#fff"
            stroke="#d8dee8"
            strokeWidth="0.7"
          />
          <path d="M26 11 L27 72 M48 14 L44 80 M67 17 L64 79 M12 58 L89 42 M17 69 L86 66" stroke="#edf0f4" strokeWidth="0.4" />

          {assignments.map(({ customer, facility }) =>
            facility ? (
              <line
                key={`${facility.id}-${customer.id}`}
                x1={facility.map_x}
                y1={facility.map_y}
                x2={customer.map_x}
                y2={customer.map_y}
                stroke="#1e3a5f"
                strokeWidth="0.45"
                strokeDasharray="1.4 1.4"
                opacity="0.42"
              />
            ) : null
          )}

          {customers.map((c) => (
            <g key={c.id} transform={`translate(${c.map_x} ${c.map_y})`}>
              <circle r="2.2" fill="#fff" stroke="#b45309" strokeWidth="0.8" filter="url(#markerShadow)" />
              <circle r="0.7" fill="#b45309" />
              <text x="3.1" y="-1" fontSize="2.7" fontWeight="700" fill="#334155">
                {c.id}
              </text>
              <text x="3.1" y="2.1" fontSize="2.1" fill="#64748b">
                {c.city.split(",")[0]}
              </text>
            </g>
          ))}

          {facilities.map((f) => {
            const isSelected = selected.has(f.id);
            return (
              <g
                key={f.id}
                transform={`translate(${f.map_x} ${f.map_y})`}
                onClick={() => onToggle(f.id)}
                className="cursor-pointer"
                role="button"
                aria-label={`${isSelected ? "Close" : "Open"} facility ${f.id}`}
              >
                <rect
                  x="-2.8"
                  y="-2.8"
                  width="5.6"
                  height="5.6"
                  rx="1.2"
                  fill={isSelected ? "#1e3a5f" : "#fff"}
                  stroke="#1e3a5f"
                  strokeWidth="0.8"
                  filter="url(#markerShadow)"
                />
                <text x="0" y="0.95" textAnchor="middle" fontSize="2.6" fontWeight="800" fill={isSelected ? "#fff" : "#1e3a5f"}>
                  {f.id}
                </text>
                <text x="3.8" y="-0.6" fontSize="2.35" fontWeight="700" fill="#334155">
                  {f.name}
                </text>
                <text x="3.8" y="2" fontSize="1.95" fill="#64748b">
                  {f.city}
                </text>
              </g>
            );
          })}
        </svg>

        {selected.size === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-max rounded-full border border-[var(--card-border)] bg-white/90 px-3 py-1.5 text-xs text-[var(--slate)] shadow-sm backdrop-blur">
            Select facilities to preview customer assignments
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
          <span className="w-5 border-t border-dashed border-[var(--navy)] opacity-60" /> Current assignment
        </span>
      </div>
    </div>
  );
}

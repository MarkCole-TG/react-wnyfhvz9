/* ============================================================
   OFFICE DAYS PLANNER — CLEAN REBUILD (PRINT‑ISOLATED VERSION)
   PART 1 OF 3
============================================================ */
import React from "react";
import { useState, useEffect, useMemo } from "react";
import { createStaffMember, deleteStaffMember, fetchStaff, updateStaffMember } from "./api/staff";
import { fetchScheduleWeek, upsertScheduleEntry } from "./api/schedule";
import { lockWeek, unlockWeek, updateUserRoles } from "./api/admin";
import { fetchApiMessage } from "./api/message";

/* -----------------------------------------
   DAYS + OPTIONS
------------------------------------------ */
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const options = ["", "WFH", "Office", "Site", "Holiday", "Absent", "Training"];
const MIN_MHFA = 1;
const MIN_FIRE = 3;
const MIN_FIRST = 2;
const MIN_DIRECTOR = 1;

const defaultRoles = {
  mhfa: false,
  fire: false,
  first: false,
  director: false,
  guest: false
};

function normalizeStaffMember(staff) {
  const roles = staff?.roles || {};
  return {
    ...staff,
    roles: {
      ...defaultRoles,
      mhfa: Boolean(roles.mhfa),
      fire: Boolean(roles.fire),
      first: Boolean(roles.first),
      director: Boolean(roles.director),
      guest: Boolean(roles.guest)
    }
  };
}

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

function normalizeWeekRecord(weekIsoDate, weekRecord) {
  return {
    week: weekRecord?.week || weekIsoDate,
    status: weekRecord?.status || "open",
    lockedBy: weekRecord?.lockedBy,
    lockedAt: weekRecord?.lockedAt,
    unlockedBy: weekRecord?.unlockedBy,
    unlockedAt: weekRecord?.unlockedAt,
    updatedAt: weekRecord?.updatedAt
  };
}

/* ============================================================
   MAIN APP COMPONENT
============================================================ */
export default function App() {

  /* -----------------------------------------
     LOAD FROM LOCALSTORAGE ON STARTUP
  ------------------------------------------ */
  const [staff, setStaff] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [isLoadingWeek, setIsLoadingWeek] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [apiMessage, setApiMessage] = useState("");
  const [weekRecords, setWeekRecords] = useState({});

  /* -----------------------------------------
     OPEN ON NEXT MONDAY
  ------------------------------------------ */
  const [anchorDate, setAnchorDate] = useState(() => {
    const today = new Date();
    const thisMonday = startOfISOWeek(today);
    const nextMonday = addDays(thisMonday, 7);
    return nextMonday;
  });

  const weekInfo = useMemo(() => getISOWeekInfo(anchorDate), [anchorDate]);
  const weekKey = weekKeyFromDate(weekInfo.start);
  const weekIsoDate = toIsoDate(getMondayFromWeekKey(weekKey));
  const currentWeek = weekRecords[weekKey] || normalizeWeekRecord(weekIsoDate);
  const isWeekLocked = currentWeek.status === "locked";

  useEffect(() => {
    let active = true;

    async function loadMessage() {
      try {
        const message = await fetchApiMessage();
        if (!active) return;
        setApiMessage(message || "");
      } catch {
        if (!active) return;
        setApiMessage("");
      }
    }

    loadMessage();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadStaff() {
      setIsLoadingStaff(true);
      try {
        const loadedStaff = await fetchStaff();
        if (!active) return;
        setStaff(loadedStaff.map(normalizeStaffMember));
        setErrorMessage("");
      } catch (error) {
        if (!active) return;
        setErrorMessage(getErrorMessage(error, "Unable to load staff."));
      } finally {
        if (active) {
          setIsLoadingStaff(false);
        }
      }
    }

    loadStaff();

    return () => {
      active = false;
    };
  }, []);

  /* -----------------------------------------
     ROW FORMAT
  ------------------------------------------ */
  const emptyRow = {
    MonAM: "", MonPM: "",
    TueAM: "", TuePM: "",
    WedAM: "", WedPM: "",
    ThuAM: "", ThuPM: "",
    FriAM: "", FriPM: "",
    comment: ""
  };

  const getRow = (wk, id) =>
    schedule[wk]?.[id] ? { ...emptyRow, ...schedule[wk][id] } : { ...emptyRow };

  const setRow = (wk, id, next) => {
    setSchedule(prev => ({
      ...prev,
      [wk]: { ...(prev[wk] || {}), [id]: next }
    }));
  };

  useEffect(() => {
    let active = true;

    async function loadWeekSchedule() {
      setIsLoadingWeek(true);
      try {
        const payload = await fetchScheduleWeek(weekIsoDate);
        if (!active) return;

        const rows = payload.rows || [];
        const nextWeekSchedule = rows.reduce((acc, row) => {
          acc[row.staffId] = { ...emptyRow, ...row };
          return acc;
        }, {});

        setSchedule(prev => ({
          ...prev,
          [weekKey]: nextWeekSchedule
        }));
        setWeekRecords(prev => ({
          ...prev,
          [weekKey]: normalizeWeekRecord(weekIsoDate, payload.week)
        }));
        setErrorMessage("");
      } catch (error) {
        if (!active) return;
        setErrorMessage(getErrorMessage(error, "Unable to load week schedule."));
      } finally {
        if (active) {
          setIsLoadingWeek(false);
        }
      }
    }

    loadWeekSchedule();

    return () => {
      active = false;
    };
  }, [weekIsoDate, weekKey]);

  /* -----------------------------------------
     UPDATE CELL
  ------------------------------------------ */
  const updateField = async (id, field, value) => {
    if (isWeekLocked) {
      setErrorMessage("This week is locked. Unlock it before making schedule changes.");
      return;
    }

    const row = getRow(weekKey, id);
    if (row[field] === value) {
      return;
    }

    setIsSaving(true);
    try {
      const saved = await upsertScheduleEntry(weekIsoDate, id, { [field]: value }, row.updatedAt);
      setRow(weekKey, id, { ...emptyRow, ...saved });
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to save schedule change."));
    } finally {
      setIsSaving(false);
    }
  };

  /* -----------------------------------------
     SCREEN‑ONLY SEARCH
  ------------------------------------------ */
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(s =>
      [s.name, s.number].join(" ").toLowerCase().includes(q)
    );
  }, [search, staff]);

  /* -----------------------------------------
     PRINT FIRE‑DRILL + ORIENTATION
  ------------------------------------------ */
  const [printOrientation, setPrintOrientation] = useState("landscape");

  const printPDF = () => {
    document.body.classList.add("print-mode");
    document.body.classList.add(printOrientation === "landscape" ? "print-landscape" : "print-portrait");
    setTimeout(() => {
      window.print();
      document.body.classList.remove("print-mode");
      document.body.classList.remove("print-landscape");
      document.body.classList.remove("print-portrait");
    }, 40);
  };

  /* -----------------------------------------
     WEEK NAVIGATION
  ------------------------------------------ */
  const goPrev = () => setAnchorDate(addDays(anchorDate, -7));
  const goNext = () => setAnchorDate(addDays(anchorDate, 7));
  const goToday = () => {
    const today = new Date();
    const thisMonday = startOfISOWeek(today);
    setAnchorDate(addDays(thisMonday, 7));
  };

  /* -----------------------------------------
     MODAL STATES
  ------------------------------------------ */
  const [addOpen, setAddOpen] = useState(false);
  const [addStaffError, setAddStaffError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const lockCurrentWeek = async () => {
    setIsSaving(true);
    try {
      const updated = await lockWeek(weekIsoDate);
      setWeekRecords(prev => ({
        ...prev,
        [weekKey]: normalizeWeekRecord(weekIsoDate, updated)
      }));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to lock this week."));
    } finally {
      setIsSaving(false);
    }
  };

  const unlockCurrentWeek = async () => {
    setIsSaving(true);
    try {
      const updated = await unlockWeek(weekIsoDate);
      setWeekRecords(prev => ({
        ...prev,
        [weekKey]: normalizeWeekRecord(weekIsoDate, updated)
      }));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to unlock this week."));
    } finally {
      setIsSaving(false);
    }
  };

  const saveUserRoles = async ({ entraObjectId, roles }) => {
    setIsSaving(true);
    try {
      await updateUserRoles(entraObjectId, roles);
      setRolesOpen(false);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to update user roles."));
    } finally {
      setIsSaving(false);
    }
  };

  /* ============================================================
     PART 1 ENDS HERE — NEXT PART CONTAINS:
     - Planner JSX
     - Fire‑drill JSX (print‑only)
============================================================ */
/* ============================================================
   PART 2 OF 3 — MAIN UI + FIRE‑DRILL PRINT‑ONLY
============================================================ */

return (
  <>
    {/* ======================================================
       MAIN SCREEN‑ONLY PLANNER UI (NOT PRINTED)
    ======================================================= */}
    <div className="min-h-screen bg-gray-100 p-6 screen-only">

      {apiMessage && (
        <div className="mb-4 rounded-md border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-900">
          API Message: {apiMessage}
        </div>
      )}

      {(isLoadingStaff || isLoadingWeek) && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
          Loading planner data...
        </div>
      )}

      {isWeekLocked && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          This week is locked. Schedule edits are disabled until the week is unlocked.
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
          {errorMessage}
        </div>
      )}

      {/* HEADER */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800">
          Office Days Planner
        </h1>
        
<div className="text-lg font-semibold text-gray-700 mt-1">
  Week Commencing: {formatDate(weekInfo.start)}
</div>


        <div className="flex gap-3">
          <button
            onClick={() => setAddOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow"
          >
            Add Staff
          </button>

          <button
            onClick={() => setRolesOpen(true)}
            className="px-4 py-2 bg-slate-600 text-white rounded-lg shadow"
          >
            User Roles
          </button>

          <button
            onClick={() => setExportOpen(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg shadow"
          >
            Export
          </button>
        </div>
      </div>

      {/* SEARCH BAR */}
      <input
        placeholder="Search staff..."
        className="mb-4 w-full h-10 px-3 rounded-md border border-gray-300"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
{/* SAFETY ALERTS + PEOPLE TOTALS (HORIZONTAL) */}
<div className="mb-4 p-4 bg-white shadow rounded-lg">

  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

    {days.map(d => {

      const amOffice = filtered.filter(s =>
        getRow(weekKey, s.id)[d + "AM"] === "Office"
      );

      const pmOffice = filtered.filter(s =>
        getRow(weekKey, s.id)[d + "PM"] === "Office"
      );

      // AM Roles - count
      const amMHFACount = amOffice.filter(s => s.roles?.mhfa).length;
      const amFireCount = amOffice.filter(s => s.roles?.fire).length;
      const amFirstCount = amOffice.filter(s => s.roles?.first).length;
      const amDirectorCount = amOffice.filter(s => s.roles?.director).length;

      // PM Roles - count
      const pmMHFACount = pmOffice.filter(s => s.roles?.mhfa).length;
      const pmFireCount = pmOffice.filter(s => s.roles?.fire).length;
      const pmFirstCount = pmOffice.filter(s => s.roles?.first).length;
      const pmDirectorCount = pmOffice.filter(s => s.roles?.director).length;

      const warnings = [];
      const add = (label, colour, slot) =>
        warnings.push({ label, colour, slot });

      // MHFA (min 1)
      if (amMHFACount < MIN_MHFA && pmMHFACount < MIN_MHFA) add("MHFA", "bg-yellow-400", "All Day");
      else {
        if (amMHFACount < MIN_MHFA) add("MHFA", "bg-yellow-400", "AM");
        if (pmMHFACount < MIN_MHFA) add("MHFA", "bg-yellow-400", "PM");
      }

      // FIRE (min 3)
      if (amFireCount < MIN_FIRE && pmFireCount < MIN_FIRE) add("Fire Wardens (3+)", "bg-red-500", "All Day");
      else {
        if (amFireCount < MIN_FIRE) add("Fire Wardens (3+)", "bg-red-500", "AM");
        if (pmFireCount < MIN_FIRE) add("Fire Wardens (3+)", "bg-red-500", "PM");
      }

      // FIRST AIDER (min 2)
      if (amFirstCount < MIN_FIRST && pmFirstCount < MIN_FIRST) add("First Aiders (2+)", "bg-green-500", "All Day");
      else {
        if (amFirstCount < MIN_FIRST) add("First Aiders (2+)", "bg-green-500", "AM");
        if (pmFirstCount < MIN_FIRST) add("First Aiders (2+)", "bg-green-500", "PM");
      }

      // DIRECTOR (min 1)
      if (amDirectorCount < MIN_DIRECTOR && pmDirectorCount < MIN_DIRECTOR) add("Director", "bg-purple-500", "All Day");
      else {
        if (amDirectorCount < MIN_DIRECTOR) add("Director", "bg-purple-500", "AM");
        if (pmDirectorCount < MIN_DIRECTOR) add("Director", "bg-purple-500", "PM");
      }

      return (
        <div key={d} className="p-2 border rounded-lg bg-gray-50">

          {/* DAY NAME */}
          <div className="font-bold text-gray-800 mb-2">{d}</div>

          {/* SAFETY ALERTS FIRST */}
          {warnings.length === 0 ? (
            <div className="text-green-700 font-medium mb-3 bg-green-50 p-2 rounded">✔ All Roles Covered</div>
          ) : (
            <div className="flex flex-col gap-1 text-red-700 font-medium mb-3">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span>⚠</span>
                  <span className={`w-3 h-3 rounded-full ${w.colour}`}></span>
                  <span>No {w.label} ({w.slot})</span>
                </div>
              ))}
            </div>
          )}

          {/* PEOPLE TOTALS SECOND */}
          <div className="text-sm text-gray-800">
            <div>AM: {amOffice.length} people</div>
            <div>PM: {pmOffice.length} people</div>
          </div>

        </div>
      );
    })}

  </div>

</div>

      {/* WEEK CONTROLS */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button onClick={goPrev} className="px-3 py-1.5 rounded-md border bg-white">◀</button>
        <button onClick={goNext} className="px-3 py-1.5 rounded-md border bg-white">▶</button>
        <button onClick={goToday} className="px-3 py-1.5 rounded-md bg-gray-200">
          Next Week
        </button>

        <input
          type="date"
          className="h-9 px-3 rounded-md border border-gray-300"
          onChange={(e) => {
            if (!e.target.value) return;
            const [y, m, d] = e.target.value.split("-").map(Number);
            setAnchorDate(new Date(y, m - 1, d));
          }}
        />

        <button
          onClick={lockCurrentWeek}
          disabled={isSaving || isWeekLocked}
          className="px-3 py-1.5 rounded-md bg-amber-600 text-white disabled:opacity-50"
        >
          Lock Week
        </button>

        <button
          onClick={unlockCurrentWeek}
          disabled={isSaving || !isWeekLocked}
          className="px-3 py-1.5 rounded-md bg-emerald-600 text-white disabled:opacity-50"
        >
          Unlock Week
        </button>
      </div>
{/* ROLE KEY */}
<div className="mb-4 p-4 bg-white shadow rounded-lg flex flex-wrap items-center gap-6 text-sm">

  <div className="flex items-center gap-2">
    <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
    <span>MHFA (1+)</span>
  </div>

  <div className="flex items-center gap-2">
    <span className="w-3 h-3 rounded-full bg-red-500"></span>
    <span>Fire Warden (3+)</span>
  </div>

  <div className="flex items-center gap-2">
    <span className="w-3 h-3 rounded-full bg-green-500"></span>
    <span>First Aider (2+)</span>
  </div>

  <div className="flex items-center gap-2">
    <span className="w-3 h-3 rounded-full bg-purple-500"></span>
    <span>Associate/Director (1+)</span>
  </div>

  <div className="flex items-center gap-2">
    <span className="font-bold text-blue-700">G</span>
    <span>Guest</span>
  </div>

</div>
      {/* MAIN TABLE */}
      <div className="overflow-x-auto bg-white shadow rounded-lg">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="sticky left-0 bg-gray-50 px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Comment</th>

              {days.map(d => (
                <th key={d} className="px-4 py-2 text-left align-top">
                  <div className="flex flex-col">
                    <span className="font-semibold">{d}</span>
                    <span className="text-sm text-gray-600">AM</span>
                    <span className="text-sm text-gray-600">PM</span>
                  </div>
                </th>
              ))}

              <th className="px-4 py-2 text-left">Edit</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map(s => {
              const row = getRow(weekKey, s.id);

              return (
                <tr key={s.id} className="border-b hover:bg-gray-50">

                  {/* NAME */}
                  <td className="sticky left-0 bg-white px-4 py-2 font-medium text-gray-800 whitespace-nowrap">
                    {s.name} ({s.number})
                    {s.roles?.guest && (
                      <span className="ml-2 font-bold text-blue-700">G</span>
                    )}
                    <span className="inline-flex ml-3 gap-1">
                      {s.roles?.mhfa && <ColourDot colour="bg-yellow-400" />}
                      {s.roles?.fire && <ColourDot colour="bg-red-500" />}
                      {s.roles?.first && <ColourDot colour="bg-green-500" />}
                      {s.roles?.director && <ColourDot colour="bg-purple-500" />}
                    </span>
                  </td>

                  {/* COMMENT */}
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      className="w-32 md:w-48 px-2 py-1 border rounded"
                      value={row.comment}
                      maxLength={40}
                      disabled={isSaving || isWeekLocked}
                      onChange={(e) =>
                        updateField(s.id, "comment", e.target.value)
                      }
                    />
                  </td>

                  {/* AM + PM */}
                  {days.map(d => (
                    <td key={s.id + d} className="px-4 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        <select
                          className="w-20 px-2 py-1 border rounded"
                          value={row[d + "AM"]}
                          disabled={isSaving || isWeekLocked}
                          onChange={(e) =>
                            updateField(s.id, d + "AM", e.target.value)
                          }
                        >
                          {options.map(o => (
                            <option key={o} value={o}>
                              {o || "—"}
                            </option>
                          ))}
                        </select>

                        <select
                          className="w-20 px-2 py-1 border rounded"
                          value={row[d + "PM"]}
                          disabled={isSaving || isWeekLocked}
                          onChange={(e) =>
                            updateField(s.id, d + "PM", e.target.value)
                          }
                        >
                          {options.map(o => (
                            <option key={o} value={o}>
                              {o || "—"}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  ))}

                  {/* EDIT */}
                  <td className="px-4 py-2">
                    <button
                      onClick={() => {
                        setEditTarget({ ...s });
                        setEditOpen(true);
                      }}
                      className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                    >
                      Edit
                    </button>
                  </td>

                </tr>
              );
            })}
          </tbody>


        </table>
      </div>
    
      </div>
      {/* END OF .screen-only (NOT PRINTED) */}

{/* ======================================================
   FIRE‑DRILL ROLL — PRINT ONLY
   A3 LANDSCAPE, WITH KEY + ROLES NEXT TO NAMES
====================================================== */}
<div className="print-only p-6 text-gray-900 text-sm">

{/* TITLE */}
<h2 className="text-3xl font-bold mb-2 text-center">
  Fire Drill Roll — Office Attendance
</h2>

<div className="text-center font-semibold mb-8">
  Week Commencing: {formatDate(weekInfo.start)}
</div>

{/* PRINT ROLE KEY */}
<div className="mb-6 flex flex-wrap gap-8 text-base">
  <div className="flex items-center gap-2">
    <span className="w-4 h-4 rounded-full bg-yellow-400"></span>
    <span>MHFA</span>
  </div>
  <div className="flex items-center gap-2">
    <span className="w-4 h-4 rounded-full bg-red-500"></span>
    <span>Fire Warden</span>
  </div>
  <div className="flex items-center gap-2">
    <span className="w-4 h-4 rounded-full bg-green-500"></span>
    <span>First Aider</span>
  </div>
  <div className="flex items-center gap-2">
    <span className="w-4 h-4 rounded-full bg-purple-500"></span>
    <span>Director</span>
  </div>
  <div className="flex items-center gap-2">
    <span className="font-bold text-blue-700">G</span>
    <span>Guest</span>
  </div>
</div>

{/* MAIN PRINT TABLE */}
<table className="w-full border-collapse text-left text-base whitespace-nowrap">
  <thead>
    <tr>
      <th className="border p-2 sticky left-0 bg-white">Name</th>

      {days.map(d => (
        <React.Fragment key={d}>
          <th className="border p-2">{d} AM</th>
          <th className="border p-2">{d} PM</th>
        </React.Fragment>
      ))}

      <th className="border p-2">Comments</th>
    </tr>
  </thead>

  <tbody>
    {staff
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(s => {
        const row = getRow(weekKey, s.id);

        return (
          <tr key={s.id}>

            {/* NAME + ROLES */}
            <td className="border p-2 sticky left-0 bg-white font-semibold flex items-center gap-2 whitespace-nowrap">
              <span>{s.name}</span>

              {/* ROLE ICONS */}
              {s.roles?.mhfa && (
                <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
              )}
              {s.roles?.fire && (
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
              )}
              {s.roles?.first && (
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
              )}
              {s.roles?.director && (
                <span className="w-3 h-3 rounded-full bg-purple-500"></span>
              )}
              {s.roles?.guest && (
                <span className="font-bold text-blue-700">G</span>
              )}
            </td>

            {/* AM/PM */}
            {days.map(d => (
              <React.Fragment key={s.id + d}>
                <td className="border p-2">
                  {row[d + "AM"] === "Office" ? "✔" : ""}
                </td>
                <td className="border p-2">
                  {row[d + "PM"] === "Office" ? "✔" : ""}
                </td>
              </React.Fragment>
            ))}

            {/* COMMENT */}
            <td className="border p-2">{row.comment}</td>
          </tr>
        );
      })}
  </tbody>

</table>

</div>
{/* ======================================================
         MODALS
      ======================================================= */}

{addOpen && (
        <AddStaffModal
          close={() => {
            setAddOpen(false);
            setAddStaffError("");
          }}
          errorMessage={addStaffError}
          add={async (name, number, roles) => {
            const normalizedName = name.trim().toLowerCase();
            const normalizedNumber = number.trim();
            if (!normalizedName || !normalizedNumber) return;

            const duplicate = staff.some((member) => {
              const sameName = member.name.trim().toLowerCase() === normalizedName;
              const sameNumber = member.number.trim() === normalizedNumber;
              return sameName || sameNumber;
            });

            if (duplicate) {
              setAddStaffError("A staff member with the same name or number already exists.");
              return;
            }

            setIsSaving(true);
            try {
              const created = await createStaffMember({ name, number, roles });
              if (!created) {
                throw new Error("Unable to create staff.");
              }

              setStaff(prev => [
                ...prev,
                normalizeStaffMember(created)
              ]);
              setAddOpen(false);
              setAddStaffError("");
              setErrorMessage("");
            } catch (error) {
              setAddStaffError(getErrorMessage(error, "Unable to create staff."));
            } finally {
              setIsSaving(false);
            }
          }}
        />
      )}

      {editOpen && editTarget && (
        <EditStaffModal
          close={() => setEditOpen(false)}
          staff={editTarget}
          setStaffData={setEditTarget}
          save={async (updated) => {
            setIsSaving(true);
            try {
              const saved = await updateStaffMember(updated.id, {
                name: updated.name,
                number: updated.number,
                roles: updated.roles,
                updatedAt: updated.updatedAt
              });

              if (!saved) {
                throw new Error("Unable to update staff.");
              }

              setStaff(prev =>
                prev.map(p => (p.id === updated.id ? normalizeStaffMember(saved) : p))
              );
              setEditOpen(false);
              setErrorMessage("");
            } catch (error) {
              setErrorMessage(getErrorMessage(error, "Unable to update staff."));
            } finally {
              setIsSaving(false);
            }
          }}
          deleteStaff={async (member) => {
            if (!window.confirm("Delete staff?")) {
              return;
            }

            setIsSaving(true);
            try {
              await deleteStaffMember(member.id, member.updatedAt);
              setStaff(prev => prev.filter((item) => item.id !== member.id));
              setSchedule(prev => {
                const next = { ...prev };
                for (const week of Object.keys(next)) {
                  if (next[week]?.[member.id]) {
                    next[week] = { ...next[week] };
                    delete next[week][member.id];
                  }
                }
                return next;
              });
              setEditOpen(false);
              setErrorMessage("");
            } catch (error) {
              setErrorMessage(getErrorMessage(error, "Unable to delete staff."));
            } finally {
              setIsSaving(false);
            }
          }}
        />
      )}

      {exportOpen && (
        <ExportModal
          close={() => setExportOpen(false)}
          printPDF={printPDF}
          printOrientation={printOrientation}
          setPrintOrientation={setPrintOrientation}
        />
      )}

      {rolesOpen && (
        <UserRolesModal
          close={() => setRolesOpen(false)}
          save={saveUserRoles}
          disabled={isSaving}
        />
      )}

    </>
  );
}


/* =====================================
   COMPONENTS — ADD STAFF MODAL
====================================== */

function AddStaffModal({ close, add, errorMessage }) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [roles, setRoles] = useState({
    mhfa: false,
    fire: false,
    first: false,
    director: false,
    guest: false
  });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white/90 rounded-xl shadow-xl p-6 w-full max-w-md">

        <h2 className="text-xl font-bold mb-4">Add New Staff</h2>

        {errorMessage && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {errorMessage}
          </div>
        )}

        <div className="space-y-3">

          <input
            className="h-10 px-3 w-full rounded-md border"
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            className="h-10 px-3 w-full rounded-md border"
            placeholder="Staff Number (4 digits max)"
            value={number}
            maxLength={4}
            onChange={(e) => setNumber(e.target.value.slice(0, 4))}
          />

          <div className="flex gap-4 flex-wrap text-gray-800">

            <RoleCheckbox
              label="MHFA"
              colour="bg-yellow-400"
              value={roles.mhfa}
              onChange={(v) => setRoles({ ...roles, mhfa: v })}
            />

            <RoleCheckbox
              label="Fire"
              colour="bg-red-500"
              value={roles.fire}
              onChange={(v) => setRoles({ ...roles, fire: v })}
            />

            <RoleCheckbox
              label="First Aider"
              colour="bg-green-500"
              value={roles.first}
              onChange={(v) => setRoles({ ...roles, first: v })}
            />

            <RoleCheckbox
              label="Associate/Director"
              colour="bg-purple-500"
              value={roles.director}
              onChange={(v) => setRoles({ ...roles, director: v })}
            />

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={roles.guest}
                onChange={(e) =>
                  setRoles({ ...roles, guest: e.target.checked })
                }
              />
              Guest (G)
            </label>

          </div>

        </div>

        <div className="mt-6 flex justify-end gap-3">

          <button
            onClick={close}
            className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
          >
            Cancel
          </button>

          <button
            onClick={() => add(name, number, roles)}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            Add
          </button>

        </div>

      </div>
    </div>
  );
}


/* =====================================
   COMPONENTS — EDIT STAFF MODAL
====================================== */

function EditStaffModal({ close, staff, setStaffData, save, deleteStaff }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white/90 rounded-xl shadow-xl p-6 w-full max-w-md">

        <h2 className="text-xl font-bold mb-4">Edit Staff</h2>

        <div className="space-y-3">

          <input
            className="h-10 px-3 w-full rounded-md border"
            placeholder="Full Name"
            value={staff.name}
            onChange={(e) =>
              setStaffData({ ...staff, name: e.target.value })
            }
          />

          <input
            className="h-10 px-3 w-full rounded-md border"
            placeholder="Staff Number (4 digits max)"
            value={staff.number}
            maxLength={4}
            onChange={(e) =>
              setStaffData({ ...staff, number: e.target.value.slice(0, 4) })
            }
          />

          <div className="flex gap-4 flex-wrap text-gray-800">

            <RoleCheckbox
              label="MHFA"
              colour="bg-yellow-400"
              value={staff.roles.mhfa}
              onChange={(v) =>
                setStaffData({
                  ...staff,
                  roles: { ...staff.roles, mhfa: v }
                })
              }
            />

            <RoleCheckbox
              label="Fire"
              colour="bg-red-500"
              value={staff.roles.fire}
              onChange={(v) =>
                setStaffData({
                  ...staff,
                  roles: { ...staff.roles, fire: v }
                })
              }
            />

            <RoleCheckbox
              label="First Aider"
              colour="bg-green-500"
              value={staff.roles.first}
              onChange={(v) =>
                setStaffData({
                  ...staff,
                  roles: { ...staff.roles, first: v }
                })
              }
            />

            <RoleCheckbox
              label="Associate/Director"
              colour="bg-purple-500"
              value={staff.roles.director}
              onChange={(v) =>
                setStaffData({
                  ...staff,
                  roles: { ...staff.roles, director: v }
                })
              }
            />

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={staff.roles.guest}
                onChange={(e) =>
                  setStaffData({
                    ...staff,
                    roles: { ...staff.roles, guest: e.target.checked }
                  })
                }
              />
              Guest (G)
            </label>

          </div>

        </div>

        <div className="mt-6 flex justify-between">

          <button
            onClick={() => deleteStaff(staff)}
            className="px-4 py-2 rounded-lg bg-red-200 text-red-800 hover:bg-red-300"
          >
            Delete Staff
          </button>

          <div className="flex gap-3">
            <button
              onClick={close}
              className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
            >
              Cancel
            </button>

            <button
              onClick={() => save(staff)}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Save
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}


/* =====================================
   COMPONENTS — EXPORT MODAL
====================================== */

function ExportModal({ close, printPDF, printOrientation, setPrintOrientation }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white/90 rounded-xl shadow-xl p-6 w-full max-w-sm">

        <h2 className="text-xl font-bold mb-4">Export Options</h2>

        <div className="flex flex-col gap-3">

          <div className="flex gap-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="orientation"
                value="landscape"
                checked={printOrientation === "landscape"}
                onChange={(e) => setPrintOrientation(e.target.value)}
              />
              Landscape (A3)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="orientation"
                value="portrait"
                checked={printOrientation === "portrait"}
                onChange={(e) => setPrintOrientation(e.target.value)}
              />
              Portrait (A3)
            </label>
          </div>

          <button
            onClick={() => {
              printPDF();
              close();
            }}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700"
          >
            Print Fire Drill Roll
          </button>

          <button
            onClick={close}
            className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
          >
            Cancel
          </button>

        </div>

      </div>
    </div>
  );
}


/* =====================================
   COMPONENTS — ROLE CHECKBOX / DOT
====================================== */

function RoleCheckbox({ label, colour, value, onChange }) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="inline-flex items-center gap-1">
        <span className={`w-3 h-3 rounded-full inline-block ${colour}`} />
        {label}
      </span>
    </label>
  );
}

function ColourDot({ colour }) {
  return <span className={`w-3 h-3 rounded-full inline-block ${colour}`} />;
}


/* =====================================
   UTILITIES
====================================== */

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDate(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${d}/${m}/${y}`;
}

function stripTime(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfISOWeek(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfISOWeek(date) {
  const s = startOfISOWeek(date);
  const e = new Date(s);
  e.setDate(s.getDate() + 4);
  e.setHours(23, 59, 59, 999);
  return e;
}

function getISOWeekInfo(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  const thursday = new Date(d);
  thursday.setDate(d.getDate() + (4 - day));

  const year = thursday.getFullYear();
  const monday = startOfISOWeek(d);
  const friday = endOfISOWeek(d);

  const yearStart = new Date(year, 0, 1);
  const diffDays =
    Math.floor((stripTime(thursday) - stripTime(yearStart)) / 86400000) + 1;
  const week = Math.ceil(diffDays / 7);

  return { week, year, start: monday, end: friday };
}

function weekKeyFromDate(date) {
  const info = getISOWeekInfo(date);
  return `${info.year}-W${String(info.week).padStart(2, "0")}`;
}

function getMondayFromWeekKey(weekKey) {
  const [y, w] = weekKey.split("-W");
  const year = Number(y);
  const week = Number(w);

  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;

  const mon1 = new Date(jan4);
  mon1.setDate(jan4.getDate() - (jan4Day - 1));

  const mon = new Date(mon1);
  mon.setDate(mon1.getDate() + (week - 1) * 7);

  return mon;
}

function UserRolesModal({ close, save, disabled }) {
  const [entraObjectId, setEntraObjectId] = useState("");
  const [roles, setRoles] = useState({
    viewer: false,
    planner: true,
    admin: false
  });

  const selectedRoles = [];
  if (roles.viewer) selectedRoles.push("viewer");
  if (roles.planner) selectedRoles.push("planner");
  if (roles.admin) selectedRoles.push("admin");

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white/90 rounded-xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Update User Roles</h2>

        <div className="space-y-3">
          <input
            className="h-10 px-3 w-full rounded-md border"
            placeholder="Entra Object ID"
            value={entraObjectId}
            onChange={(e) => setEntraObjectId(e.target.value)}
          />

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={roles.viewer}
              onChange={(e) => setRoles({ ...roles, viewer: e.target.checked })}
            />
            viewer
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={roles.planner}
              onChange={(e) => setRoles({ ...roles, planner: e.target.checked })}
            />
            planner
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={roles.admin}
              onChange={(e) => setRoles({ ...roles, admin: e.target.checked })}
            />
            admin
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={close}
            className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
          >
            Cancel
          </button>

          <button
            disabled={disabled || !entraObjectId.trim() || selectedRoles.length === 0}
            onClick={() => save({ entraObjectId: entraObjectId.trim(), roles: selectedRoles })}
            className="px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Save Roles
          </button>
        </div>
      </div>
    </div>
  );
}
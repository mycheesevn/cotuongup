"use client";

import { STR, type Lang } from "@/lib/jieqi/i18n";
import {
  memberName,
  tournamentStandings,
  type RoomMember,
  type RoomTournament,
} from "@/lib/supabase/rooms";

interface Props {
  lang: Lang;
  tournament: RoomTournament;
  members: RoomMember[];
  isLeader: boolean;
  busy: boolean;
  onNext: () => void;
  onCancel: () => void;
}

function nameOf(members: RoomMember[], id: string, fb: string) {
  const m = members.find((x) => x.user_id === id);
  return m ? memberName(m.profile, fb) : fb;
}

/** Round-robin tournament card: standings + next-match control. */
export function TournamentCard({
  lang,
  tournament,
  members,
  isLeader,
  busy,
  onNext,
  onCancel,
}: Props) {
  const s = STR[lang];
  const standings = tournamentStandings(tournament.pairings);
  const played = tournament.pairings.filter((p) => p.result).length;
  const total = tournament.pairings.length;
  const open = tournament.status === "open";

  return (
    <div className="cu-room-card">
      <div className="cu-room-tournament-head">
        <strong>🏆 {tournament.name}</strong>
        <span className="cu-room-move-badge">
          {open ? s.roomOpenTournament : s.roomTournamentFinished} · {played}/
          {total}
        </span>
      </div>
      {standings.length > 0 ? (
        <table className="cu-room-standings">
          <tbody>
            {standings.map((row, i) => (
              <tr key={row.userId}>
                <td>#{i + 1}</td>
                <td>{nameOf(members, row.userId, "?")}</td>
                <td className="cu-num">
                  {row.pts} {s.roomPoints}
                </td>
                <td className="cu-num">
                  {row.wins} {s.wins}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="cu-empty-note">{s.roomNoTournament}</p>
      )}
      {isLeader && open && (
        <div className="cu-room-tournament-actions">
          <button
            type="button"
            className="cu-btn small primary"
            disabled={busy}
            onClick={onNext}
          >
            {s.roomTournamentNext}
          </button>
          <button
            type="button"
            className="cu-btn small danger"
            disabled={busy}
            onClick={onCancel}
          >
            {s.roomCancelTournament}
          </button>
        </div>
      )}
    </div>
  );
}

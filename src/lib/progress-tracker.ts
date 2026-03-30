/**
 * Progress Tracker — saves analysis results to localStorage
 * and provides comparison data for return visitors.
 */

export interface SavedAnalysis {
  date: string; // ISO string
  score: number;
  grade: string;
  phases: {
    legLift: { score: number; grade: string };
    drift: { score: number; grade: string };
    footStrike: { score: number; grade: string };
    mer: { score: number; grade: string };
    release: { score: number; grade: string };
    deceleration: { score: number; grade: string };
  };
  firstName?: string;
}

const STORAGE_KEY = "pcai_history";
const MAX_HISTORY = 20;

export function saveAnalysis(analysis: SavedAnalysis): void {
  try {
    const history = getHistory();
    history.push(analysis);
    // Keep only the last MAX_HISTORY entries
    const trimmed = history.slice(-MAX_HISTORY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage might be full or unavailable
  }
}

export function getHistory(): SavedAnalysis[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedAnalysis[];
  } catch {
    return [];
  }
}

export function getPreviousAnalysis(): SavedAnalysis | null {
  const history = getHistory();
  if (history.length < 1) return null;
  return history[history.length - 1] || null;
}

export interface ProgressComparison {
  previousScore: number;
  currentScore: number;
  scoreDelta: number;
  previousGrade: string;
  currentGrade: string;
  phaseChanges: {
    phase: string;
    previousGrade: string;
    currentGrade: string;
    improved: boolean;
    declined: boolean;
  }[];
  overallImproved: boolean;
  overallDeclined: boolean;
  analysisCount: number;
  daysSinceLast: number;
}

const GRADE_ORDER: Record<string, number> = { "A+": 5, A: 4, B: 3, C: 2, D: 1, F: 0 };

export function compareWithPrevious(
  currentScore: number,
  currentGrade: string,
  currentPhases: SavedAnalysis["phases"]
): ProgressComparison | null {
  const history = getHistory();
  if (history.length < 1) return null;

  const previous = history[history.length - 1];
  const scoreDelta = currentScore - previous.score;

  const phaseNames = ["legLift", "drift", "footStrike", "mer", "release", "deceleration"] as const;
  const phaseLabels: Record<string, string> = {
    legLift: "Leg Lift",
    drift: "Stride",
    footStrike: "Foot Strike",
    mer: "Arm Cocking",
    release: "Release",
    deceleration: "Follow-Through",
  };

  const phaseChanges = phaseNames.map((p) => {
    const prev = previous.phases?.[p] || { score: 0, grade: "C" };
    const curr = currentPhases[p] || { score: 0, grade: "C" };
    const prevRank = GRADE_ORDER[prev.grade] ?? 2;
    const currRank = GRADE_ORDER[curr.grade] ?? 2;
    return {
      phase: phaseLabels[p],
      previousGrade: prev.grade,
      currentGrade: curr.grade,
      improved: currRank > prevRank,
      declined: currRank < prevRank,
    };
  });

  const daysSinceLast = Math.floor(
    (Date.now() - new Date(previous.date).getTime()) / 86_400_000
  );

  return {
    previousScore: previous.score,
    currentScore,
    scoreDelta,
    previousGrade: previous.grade,
    currentGrade,
    phaseChanges,
    overallImproved: scoreDelta > 0,
    overallDeclined: scoreDelta < 0,
    analysisCount: history.length + 1,
    daysSinceLast: Math.max(0, daysSinceLast),
  };
}

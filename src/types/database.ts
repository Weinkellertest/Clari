export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  is_admin: boolean;
  is_approved: boolean;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_by: string | null;
  created_at: string;
}

export interface GroupMembership {
  id: string;
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
}

export interface Office {
  id: string;
  name: string;
  description: string | null;
  group_id: string;
  permissions: string[];
  created_at: string;
}

export interface OfficeHolder {
  id: string;
  office_id: string;
  user_id: string;
  assigned_at: string;
}

export interface ProfileWithMembership extends Profile {
  role: 'admin' | 'member' | null;
}

export interface OfficeWithHolder extends Office {
  holder: Profile | null;
}

export interface Event {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  created_by: string;
  group_id: string | null;
  is_private: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  group_id: string | null;
  created_by: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  sender_office_id: string | null;
  sender_office_name: string | null;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  description: string | null;
  capacity: number | null;
  created_by: string | null;
  created_at: string;
}

export interface RoomReservation {
  id: string;
  room_id: string;
  user_id: string;
  title: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  amount: number;
  description: string;
  transaction_date: string;
  creditor_type: 'person' | 'office';
  creditor_id: string;
  creditor_name: string;
  debtor_type: 'person' | 'office';
  debtor_id: string;
  debtor_name: string;
  group_id: string | null;
  status: 'open' | 'settled';
  created_by: string | null;
  created_at: string;
}

export interface TransactionSplit {
  id: string;
  transaction_id: string;
  user_id: string;
  share_amount: number;
  is_settled: boolean;
  settled_at: string | null;
  created_at: string;
}

export interface List {
  id: string;
  title: string;
  type: 'todo' | 'shopping';
  group_id: string | null;
  created_by: string;
  created_at: string;
}

export interface ListItem {
  id: string;
  list_id: string;
  text: string;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
  created_by: string;
  sort_order: number;
  created_at: string;
}

export type DutyStatus = 'open' | 'done' | 'checked' | 'overdue';
export type DutyRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export interface Duty {
  id: string;
  title: string;
  description: string | null;
  assigned_office_id: string | null;
  assigned_user_id: string | null;
  due_date: string | null;
  recurrence: DutyRecurrence;
  status: DutyStatus;
  completed_at: string | null;
  checked_at: string | null;
  checked_by: string | null;
  created_by: string;
  created_at: string;
}

export interface InfoPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  icon: string;
  group_id: string | null;
  sort_order: number;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

export interface FileFolder {
  id: string;
  name: string;
  group_id: string | null;
  parent_id: string | null;
  created_by: string;
  created_at: string;
}

export interface FileEntry {
  id: string;
  folder_id: string | null;
  group_id: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface Residence {
  id: string;
  user_id: string;
  room_name: string;
  moved_in: string;
  moved_out: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface Minifact {
  id: string;
  user_id: string;
  fact_key: string;
  fact_value: string;
  icon: string;
  created_at: string;
}

export type GameType = 'tictactoe' | 'connect4' | 'quiz';
export type GameStatus = 'waiting' | 'active' | 'finished';
export type GameTurn = 'player1' | 'player2';

export interface GameMatch {
  id: string;
  game_type: GameType;
  player1_id: string;
  player2_id: string;
  status: GameStatus;
  current_turn: GameTurn;
  winner_id: string | null;
  board_state: Record<string, unknown>;
  quiz_questions: unknown[] | null;
  quiz_answers: Record<string, unknown> | null;
  quiz_current_index: number | null;
  created_by: string;
  created_at: string;
  finished_at: string | null;
}

export interface GameScore {
  id: string;
  user_id: string;
  game_type: GameType;
  wins: number;
  losses: number;
  draws: number;
}

export type WidgetId = 'minifacts' | 'events' | 'duties' | 'finance' | 'messages' | 'games' | 'shortcuts';

export interface UserHomeConfig {
  user_id: string;
  widgets: WidgetId[];
  updated_at: string;
}

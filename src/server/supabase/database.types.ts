export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          asset: Database["public"]["Enums"]["kyro_asset"]
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["kyro_account_kind"]
          user_id: string | null
        }
        Insert: {
          asset: Database["public"]["Enums"]["kyro_asset"]
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["kyro_account_kind"]
          user_id?: string | null
        }
        Update: {
          asset?: Database["public"]["Enums"]["kyro_asset"]
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["kyro_account_kind"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          at: string
          detail: Json | null
          id: number
          subject: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          detail?: Json | null
          id?: number
          subject?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          detail?: Json | null
          id?: number
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chain_cursors: {
        Row: {
          chain: Database["public"]["Enums"]["kyro_chain"]
          last_height: number
          last_scanned_at: string | null
          updated_at: string
        }
        Insert: {
          chain: Database["public"]["Enums"]["kyro_chain"]
          last_height?: number
          last_scanned_at?: string | null
          updated_at?: string
        }
        Update: {
          chain?: Database["public"]["Enums"]["kyro_chain"]
          last_height?: number
          last_scanned_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      deposit_addresses: {
        Row: {
          address: string
          chain: Database["public"]["Enums"]["kyro_chain"]
          created_at: string
          derivation_index: number
          id: string
          order_reference: string | null
          user_id: string | null
        }
        Insert: {
          address: string
          chain: Database["public"]["Enums"]["kyro_chain"]
          created_at?: string
          derivation_index: number
          id?: string
          order_reference?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string
          chain?: Database["public"]["Enums"]["kyro_chain"]
          created_at?: string
          derivation_index?: number
          id?: string
          order_reference?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deposit_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deposits: {
        Row: {
          address: string
          amount: number
          asset: Database["public"]["Enums"]["kyro_asset"]
          block_height: number | null
          chain: Database["public"]["Enums"]["kyro_chain"]
          confirmations: number
          credited_at: string | null
          credited_transaction_id: string | null
          first_seen_at: string
          id: string
          order_reference: string | null
          required_confirmations: number
          status: Database["public"]["Enums"]["kyro_deposit_status"]
          tx_hash: string
          tx_index: number
          user_id: string | null
        }
        Insert: {
          address: string
          amount: number
          asset: Database["public"]["Enums"]["kyro_asset"]
          block_height?: number | null
          chain: Database["public"]["Enums"]["kyro_chain"]
          confirmations?: number
          credited_at?: string | null
          credited_transaction_id?: string | null
          first_seen_at?: string
          id?: string
          order_reference?: string | null
          required_confirmations: number
          status?: Database["public"]["Enums"]["kyro_deposit_status"]
          tx_hash: string
          tx_index?: number
          user_id?: string | null
        }
        Update: {
          address?: string
          amount?: number
          asset?: Database["public"]["Enums"]["kyro_asset"]
          block_height?: number | null
          chain?: Database["public"]["Enums"]["kyro_chain"]
          confirmations?: number
          credited_at?: string | null
          credited_transaction_id?: string | null
          first_seen_at?: string
          id?: string
          order_reference?: string | null
          required_confirmations?: number
          status?: Database["public"]["Enums"]["kyro_deposit_status"]
          tx_hash?: string
          tx_index?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deposits_credited_transaction_id_fkey"
            columns: ["credited_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_rounds: {
        Row: {
          asset: Database["public"]["Enums"]["kyro_asset"]
          client_seed: string
          created_at: string
          edge_bp: number
          game: Database["public"]["Enums"]["kyro_game"]
          id: string
          multiplier: number
          nonce: number
          outcome: Json | null
          params: Json
          payout: number
          payout_transaction_id: string | null
          seed_pair_id: string
          server_seed_hash: string
          settled_at: string | null
          stake: number
          stake_transaction_id: string | null
          status: Database["public"]["Enums"]["kyro_round_status"]
          user_id: string
        }
        Insert: {
          asset: Database["public"]["Enums"]["kyro_asset"]
          client_seed: string
          created_at?: string
          edge_bp: number
          game: Database["public"]["Enums"]["kyro_game"]
          id?: string
          multiplier?: number
          nonce: number
          outcome?: Json | null
          params?: Json
          payout?: number
          payout_transaction_id?: string | null
          seed_pair_id: string
          server_seed_hash: string
          settled_at?: string | null
          stake: number
          stake_transaction_id?: string | null
          status?: Database["public"]["Enums"]["kyro_round_status"]
          user_id: string
        }
        Update: {
          asset?: Database["public"]["Enums"]["kyro_asset"]
          client_seed?: string
          created_at?: string
          edge_bp?: number
          game?: Database["public"]["Enums"]["kyro_game"]
          id?: string
          multiplier?: number
          nonce?: number
          outcome?: Json | null
          params?: Json
          payout?: number
          payout_transaction_id?: string | null
          seed_pair_id?: string
          server_seed_hash?: string
          settled_at?: string | null
          stake?: number
          stake_transaction_id?: string | null
          status?: Database["public"]["Enums"]["kyro_round_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_rounds_payout_transaction_id_fkey"
            columns: ["payout_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_rounds_seed_pair_id_fkey"
            columns: ["seed_pair_id"]
            isOneToOne: false
            referencedRelation: "seed_pairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_rounds_seed_pair_id_fkey"
            columns: ["seed_pair_id"]
            isOneToOne: false
            referencedRelation: "seed_pairs_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_rounds_stake_transaction_id_fkey"
            columns: ["stake_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_rounds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_postings: {
        Row: {
          account_id: string
          asset: Database["public"]["Enums"]["kyro_asset"]
          created_at: string
          delta: number
          id: number
          transaction_id: string
        }
        Insert: {
          account_id: string
          asset: Database["public"]["Enums"]["kyro_asset"]
          created_at?: string
          delta: number
          id?: number
          transaction_id: string
        }
        Update: {
          account_id?: string
          asset?: Database["public"]["Enums"]["kyro_asset"]
          created_at?: string
          delta?: number
          id?: number
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_postings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "ledger_postings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_postings_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_transactions: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          kind: string
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          kind: string
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          kind?: string
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: []
      }
      order_events: {
        Row: {
          actor: string | null
          at: string
          id: number
          note: string | null
          reference: string
          status: Database["public"]["Enums"]["kyro_order_status"]
        }
        Insert: {
          actor?: string | null
          at?: string
          id?: number
          note?: string | null
          reference: string
          status: Database["public"]["Enums"]["kyro_order_status"]
        }
        Update: {
          actor?: string | null
          at?: string
          id?: number
          note?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["kyro_order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_events_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_reference_fkey"
            columns: ["reference"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["reference"]
          },
        ]
      }
      orders: {
        Row: {
          asset: Database["public"]["Enums"]["kyro_asset"]
          created_at: string
          deposit_address: string | null
          deposit_tx_hash: string | null
          direction: Database["public"]["Enums"]["kyro_direction"]
          email: string | null
          expires_at: string
          fiat: Database["public"]["Enums"]["kyro_fiat"]
          give_units: number
          gross_minor: number
          location_slug: string
          network: Database["public"]["Enums"]["kyro_chain"]
          network_fee_base: number
          rate_units: number
          receive_units: number
          reference: string
          service_fee_bp: number
          service_fee_minor: number
          status: Database["public"]["Enums"]["kyro_order_status"]
          tx_hash: string | null
          user_id: string | null
          wallet_address: string | null
        }
        Insert: {
          asset: Database["public"]["Enums"]["kyro_asset"]
          created_at?: string
          deposit_address?: string | null
          deposit_tx_hash?: string | null
          direction: Database["public"]["Enums"]["kyro_direction"]
          email?: string | null
          expires_at: string
          fiat: Database["public"]["Enums"]["kyro_fiat"]
          give_units: number
          gross_minor: number
          location_slug: string
          network: Database["public"]["Enums"]["kyro_chain"]
          network_fee_base: number
          rate_units: number
          receive_units: number
          reference: string
          service_fee_bp: number
          service_fee_minor: number
          status?: Database["public"]["Enums"]["kyro_order_status"]
          tx_hash?: string | null
          user_id?: string | null
          wallet_address?: string | null
        }
        Update: {
          asset?: Database["public"]["Enums"]["kyro_asset"]
          created_at?: string
          deposit_address?: string | null
          deposit_tx_hash?: string | null
          direction?: Database["public"]["Enums"]["kyro_direction"]
          email?: string | null
          expires_at?: string
          fiat?: Database["public"]["Enums"]["kyro_fiat"]
          give_units?: number
          gross_minor?: number
          location_slug?: string
          network?: Database["public"]["Enums"]["kyro_chain"]
          network_fee_base?: number
          rate_units?: number
          receive_units?: number
          reference?: string
          service_fee_bp?: number
          service_fee_minor?: number
          status?: Database["public"]["Enums"]["kyro_order_status"]
          tx_hash?: string | null
          user_id?: string | null
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_confirmed_at: string | null
          country: string | null
          created_at: string
          display_name: string | null
          id: string
          kyc_note: string | null
          kyc_reviewed_at: string | null
          kyc_status: Database["public"]["Enums"]["kyro_kyc_status"]
          self_excluded_until: string | null
          updated_at: string
        }
        Insert: {
          age_confirmed_at?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          kyc_note?: string | null
          kyc_reviewed_at?: string | null
          kyc_status?: Database["public"]["Enums"]["kyro_kyc_status"]
          self_excluded_until?: string | null
          updated_at?: string
        }
        Update: {
          age_confirmed_at?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          kyc_note?: string | null
          kyc_reviewed_at?: string | null
          kyc_status?: Database["public"]["Enums"]["kyro_kyc_status"]
          self_excluded_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      seed_pairs: {
        Row: {
          client_seed: string
          created_at: string
          id: string
          is_active: boolean
          nonce: number
          revealed_at: string | null
          server_seed: string
          server_seed_hash: string
          user_id: string
        }
        Insert: {
          client_seed: string
          created_at?: string
          id?: string
          is_active?: boolean
          nonce?: number
          revealed_at?: string | null
          server_seed: string
          server_seed_hash: string
          user_id: string
        }
        Update: {
          client_seed?: string
          created_at?: string
          id?: string
          is_active?: boolean
          nonce?: number
          revealed_at?: string | null
          server_seed?: string
          server_seed_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seed_pairs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_limits: {
        Row: {
          daily_deposit_cap_usd: number | null
          daily_loss_cap_usd: number | null
          pending_increase: Json | null
          pending_increase_at: string | null
          session_minutes: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          daily_deposit_cap_usd?: number | null
          daily_loss_cap_usd?: number | null
          pending_increase?: Json | null
          pending_increase_at?: string | null
          session_minutes?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          daily_deposit_cap_usd?: number | null
          daily_loss_cap_usd?: number | null
          pending_increase?: Json | null
          pending_increase_at?: string | null
          session_minutes?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawals: {
        Row: {
          address: string
          amount: number
          approved_at: string | null
          approved_by: string | null
          asset: Database["public"]["Enums"]["kyro_asset"]
          broadcast_at: string | null
          chain: Database["public"]["Enums"]["kyro_chain"]
          confirmed_at: string | null
          failure_reason: string | null
          id: string
          network_fee: number | null
          order_reference: string | null
          requested_at: string
          reserve_transaction_id: string | null
          settle_transaction_id: string | null
          status: Database["public"]["Enums"]["kyro_withdrawal_status"]
          tx_hash: string | null
          user_id: string | null
        }
        Insert: {
          address: string
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          asset: Database["public"]["Enums"]["kyro_asset"]
          broadcast_at?: string | null
          chain: Database["public"]["Enums"]["kyro_chain"]
          confirmed_at?: string | null
          failure_reason?: string | null
          id?: string
          network_fee?: number | null
          order_reference?: string | null
          requested_at?: string
          reserve_transaction_id?: string | null
          settle_transaction_id?: string | null
          status?: Database["public"]["Enums"]["kyro_withdrawal_status"]
          tx_hash?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          asset?: Database["public"]["Enums"]["kyro_asset"]
          broadcast_at?: string | null
          chain?: Database["public"]["Enums"]["kyro_chain"]
          confirmed_at?: string | null
          failure_reason?: string | null
          id?: string
          network_fee?: number | null
          order_reference?: string | null
          requested_at?: string
          reserve_transaction_id?: string | null
          settle_transaction_id?: string | null
          status?: Database["public"]["Enums"]["kyro_withdrawal_status"]
          tx_hash?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_reserve_transaction_id_fkey"
            columns: ["reserve_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_settle_transaction_id_fkey"
            columns: ["settle_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string | null
          asset: Database["public"]["Enums"]["kyro_asset"] | null
          balance: number | null
          kind: Database["public"]["Enums"]["kyro_account_kind"] | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seed_pairs_public: {
        Row: {
          client_seed: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          nonce: number | null
          revealed_at: string | null
          server_seed: string | null
          server_seed_hash: string | null
          user_id: string | null
        }
        Insert: {
          client_seed?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          nonce?: number | null
          revealed_at?: string | null
          server_seed?: never
          server_seed_hash?: string | null
          user_id?: string | null
        }
        Update: {
          client_seed?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          nonce?: number | null
          revealed_at?: string | null
          server_seed?: never
          server_seed_hash?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seed_pairs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      customer_liabilities: {
        Args: never
        Returns: {
          asset: Database["public"]["Enums"]["kyro_asset"]
          owed: number
        }[]
      }
      is_staff: { Args: { p_user_id: string }; Returns: boolean }
      next_deposit_index: { Args: never; Returns: number }
      place_bet: {
        Args: {
          p_asset: Database["public"]["Enums"]["kyro_asset"]
          p_idempotency_key: string
          p_reference_id: string
          p_stake: number
          p_user_id: string
        }
        Returns: string
      }
      settle_round: {
        Args: {
          p_asset: Database["public"]["Enums"]["kyro_asset"]
          p_idempotency_key: string
          p_payout: number
          p_reference_id: string
          p_user_id: string
        }
        Returns: string
      }
      withdrawn_last_24h: {
        Args: {
          p_asset: Database["public"]["Enums"]["kyro_asset"]
          p_user_id: string
        }
        Returns: number
      }
    }
    Enums: {
      kyro_account_kind:
        | "user"
        | "house"
        | "hot_wallet"
        | "pending_withdrawal"
        | "network_fee"
        | "service_fee"
      kyro_asset: "BTC" | "ETH" | "USDT" | "USDC" | "SOL"
      kyro_chain:
        | "bitcoin"
        | "ethereum"
        | "base"
        | "arbitrum"
        | "tron"
        | "solana"
      kyro_deposit_status:
        | "seen"
        | "confirming"
        | "credited"
        | "orphaned"
        | "ignored"
      kyro_direction: "cash-to-crypto" | "crypto-to-cash"
      kyro_fiat: "EUR" | "BAM" | "RSD" | "MKD" | "ALL"
      kyro_game: "coin-flip" | "dice" | "mines" | "crash" | "plinko" | "tower"
      kyro_kyc_status: "none" | "pending" | "verified" | "rejected"
      kyro_order_status:
        | "created"
        | "identity-confirmed"
        | "awaiting-funds"
        | "funds-received"
        | "settlement-sent"
        | "complete"
        | "cancelled"
        | "expired"
      kyro_round_status: "open" | "settled" | "cancelled"
      kyro_withdrawal_status:
        | "requested"
        | "awaiting-approval"
        | "approved"
        | "broadcast"
        | "confirmed"
        | "rejected"
        | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      kyro_account_kind: [
        "user",
        "house",
        "hot_wallet",
        "pending_withdrawal",
        "network_fee",
        "service_fee",
      ],
      kyro_asset: ["BTC", "ETH", "USDT", "USDC", "SOL"],
      kyro_chain: ["bitcoin", "ethereum", "base", "arbitrum", "tron", "solana"],
      kyro_deposit_status: [
        "seen",
        "confirming",
        "credited",
        "orphaned",
        "ignored",
      ],
      kyro_direction: ["cash-to-crypto", "crypto-to-cash"],
      kyro_fiat: ["EUR", "BAM", "RSD", "MKD", "ALL"],
      kyro_game: ["coin-flip", "dice", "mines", "crash", "plinko", "tower"],
      kyro_kyc_status: ["none", "pending", "verified", "rejected"],
      kyro_order_status: [
        "created",
        "identity-confirmed",
        "awaiting-funds",
        "funds-received",
        "settlement-sent",
        "complete",
        "cancelled",
        "expired",
      ],
      kyro_round_status: ["open", "settled", "cancelled"],
      kyro_withdrawal_status: [
        "requested",
        "awaiting-approval",
        "approved",
        "broadcast",
        "confirmed",
        "rejected",
        "failed",
      ],
    },
  },
} as const


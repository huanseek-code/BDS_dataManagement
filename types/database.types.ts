export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      partners: {
        Row: {
          created_at: string
          display_name: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          note: string | null
          phone: string | null
          total_submissions: number
          updated_at: string
          zalo_user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          note?: string | null
          phone?: string | null
          total_submissions?: number
          updated_at?: string
          zalo_user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          note?: string | null
          phone?: string | null
          total_submissions?: number
          updated_at?: string
          zalo_user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address_text: string
          attachments: Json
          code: string
          created_at: string
          district_legacy: string | null
          floor_area_m2: number | null
          house_number: string | null
          id: string
          key_details: Json
          landlord_commission_text: string | null
          landlord_commission_type: string | null
          landlord_commission_value: number | null
          location_note: string | null
          our_share_percent: number | null
          our_share_text: string | null
          price_amount: number | null
          price_basis: string
          price_currency: string
          price_period: string
          price_text: string | null
          primary_partner_id: string | null
          property_types: string[]
          province: string
          province_key: string
          status: string
          street_key: string
          street_name: string | null
          total_lease_area_m2: number | null
          updated_at: string
          ward: string | null
          ward_key: string
        }
        Insert: {
          address_text: string
          attachments?: Json
          code?: string
          created_at?: string
          district_legacy?: string | null
          floor_area_m2?: number | null
          house_number?: string | null
          id?: string
          key_details?: Json
          landlord_commission_text?: string | null
          landlord_commission_type?: string | null
          landlord_commission_value?: number | null
          location_note?: string | null
          our_share_percent?: number | null
          our_share_text?: string | null
          price_amount?: number | null
          price_basis?: string
          price_currency?: string
          price_period?: string
          price_text?: string | null
          primary_partner_id?: string | null
          property_types?: string[]
          province?: string
          province_key?: string
          status?: string
          street_key?: string
          street_name?: string | null
          total_lease_area_m2?: number | null
          updated_at?: string
          ward?: string | null
          ward_key?: string
        }
        Update: {
          address_text?: string
          attachments?: Json
          code?: string
          created_at?: string
          district_legacy?: string | null
          floor_area_m2?: number | null
          house_number?: string | null
          id?: string
          key_details?: Json
          landlord_commission_text?: string | null
          landlord_commission_type?: string | null
          landlord_commission_value?: number | null
          location_note?: string | null
          our_share_percent?: number | null
          our_share_text?: string | null
          price_amount?: number | null
          price_basis?: string
          price_currency?: string
          price_period?: string
          price_text?: string | null
          primary_partner_id?: string | null
          property_types?: string[]
          province?: string
          province_key?: string
          status?: string
          street_key?: string
          street_name?: string | null
          total_lease_area_m2?: number | null
          updated_at?: string
          ward?: string | null
          ward_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_primary_partner_id_fkey"
            columns: ["primary_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      property_listings: {
        Row: {
          address_text: string | null
          ai_extracted: Json | null
          attachments: Json
          change_history: Json
          created_at: string
          district_legacy: string | null
          floor_area_m2: number | null
          house_number: string | null
          id: string
          key_details: Json
          landlord_commission_text: string | null
          landlord_commission_type: string | null
          landlord_commission_value: number | null
          location_note: string | null
          needs_reply: boolean
          our_share_percent: number | null
          our_share_text: string | null
          partner_id: string
          price_amount: number | null
          price_basis: string | null
          price_currency: string | null
          price_period: string | null
          price_text: string | null
          property_id: string | null
          property_types: string[]
          province: string | null
          reject_reason: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_msg_ids: string[]
          street_name: string | null
          submission_id: string
          total_lease_area_m2: number | null
          updated_at: string
          ward: string | null
        }
        Insert: {
          address_text?: string | null
          ai_extracted?: Json | null
          attachments?: Json
          change_history?: Json
          created_at?: string
          district_legacy?: string | null
          floor_area_m2?: number | null
          house_number?: string | null
          id?: string
          key_details?: Json
          landlord_commission_text?: string | null
          landlord_commission_type?: string | null
          landlord_commission_value?: number | null
          location_note?: string | null
          needs_reply?: boolean
          our_share_percent?: number | null
          our_share_text?: string | null
          partner_id: string
          price_amount?: number | null
          price_basis?: string | null
          price_currency?: string | null
          price_period?: string | null
          price_text?: string | null
          property_id?: string | null
          property_types?: string[]
          province?: string | null
          reject_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_msg_ids?: string[]
          street_name?: string | null
          submission_id: string
          total_lease_area_m2?: number | null
          updated_at?: string
          ward?: string | null
        }
        Update: {
          address_text?: string | null
          ai_extracted?: Json | null
          attachments?: Json
          change_history?: Json
          created_at?: string
          district_legacy?: string | null
          floor_area_m2?: number | null
          house_number?: string | null
          id?: string
          key_details?: Json
          landlord_commission_text?: string | null
          landlord_commission_type?: string | null
          landlord_commission_value?: number | null
          location_note?: string | null
          needs_reply?: boolean
          our_share_percent?: number | null
          our_share_text?: string | null
          partner_id?: string
          price_amount?: number | null
          price_basis?: string | null
          price_currency?: string | null
          price_period?: string | null
          price_text?: string | null
          property_id?: string | null
          property_types?: string[]
          province?: string | null
          reject_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_msg_ids?: string[]
          street_name?: string | null
          submission_id?: string
          total_lease_area_m2?: number | null
          updated_at?: string
          ward?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_listings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_listings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_listings_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          ai_attempts: number
          ai_error: string | null
          ai_mode: string
          ai_model: string | null
          ai_raw_output: Json | null
          ai_status: string
          attachment_count: number
          attachments: Json
          close_at: string
          close_reason: string | null
          created_at: string
          first_msg_at: string
          id: string
          last_msg_at: string
          msg_count: number
          partner_id: string
          raw_text: string
          status: string
          updated_at: string
        }
        Insert: {
          ai_attempts?: number
          ai_error?: string | null
          ai_mode?: string
          ai_model?: string | null
          ai_raw_output?: Json | null
          ai_status?: string
          attachment_count?: number
          attachments?: Json
          close_at: string
          close_reason?: string | null
          created_at?: string
          first_msg_at?: string
          id?: string
          last_msg_at?: string
          msg_count?: number
          partner_id: string
          raw_text?: string
          status?: string
          updated_at?: string
        }
        Update: {
          ai_attempts?: number
          ai_error?: string | null
          ai_mode?: string
          ai_model?: string | null
          ai_raw_output?: Json | null
          ai_status?: string
          attachment_count?: number
          attachments?: Json
          close_at?: string
          close_reason?: string | null
          created_at?: string
          first_msg_at?: string
          id?: string
          last_msg_at?: string
          msg_count?: number
          partner_id?: string
          raw_text?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      zalo_incoming_chats: {
        Row: {
          created_at: string
          direction: string
          event_name: string
          id: number
          msg_type: string
          partner_id: string
          raw_payload: Json
          sent_at: string
          storage_paths: string[]
          submission_id: string | null
          text_content: string | null
          zalo_image_urls: string[]
          zalo_msg_id: string
        }
        Insert: {
          created_at?: string
          direction?: string
          event_name: string
          id?: never
          msg_type: string
          partner_id: string
          raw_payload?: Json
          sent_at: string
          storage_paths?: string[]
          submission_id?: string | null
          text_content?: string | null
          zalo_image_urls?: string[]
          zalo_msg_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          event_name?: string
          id?: never
          msg_type?: string
          partner_id?: string
          raw_payload?: Json
          sent_at?: string
          storage_paths?: string[]
          submission_id?: string | null
          text_content?: string | null
          zalo_image_urls?: string[]
          zalo_msg_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zalo_incoming_chats_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zalo_incoming_chats_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      zalo_oa_tokens: {
        Row: {
          access_token: string
          expires_at: string
          id: number
          refresh_token: string
          updated_at: string
        }
        Insert: {
          access_token: string
          expires_at: string
          id?: number
          refresh_token: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          expires_at?: string
          id?: number
          refresh_token?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_listing: {
        Args: {
          p_listing_id: string
          p_property_data?: Json
          p_reviewed_by?: string
        }
        Returns: Json
      }
      close_expired_submissions: {
        Args: never
        Returns: {
          attachment_count: number
          msg_count: number
          partner_id: string
          raw_text: string
          submission_id: string
        }[]
      }
      find_duplicate_properties: {
        Args: {
          p_province_key?: string
          p_street_key: string
          p_threshold?: number
          p_ward_key?: string
        }
        Returns: {
          address_text: string
          code: string
          floor_area_m2: number
          house_number: string
          id: string
          price_amount: number
          price_text: string
          province: string
          score: number
          street_name: string
          total_lease_area_m2: number
          ward: string
        }[]
      }
      ingest_zalo_message: {
        Args: {
          p_direction: string
          p_display_name: string
          p_event_name: string
          p_msg_type: string
          p_raw_payload: Json
          p_sent_at: string
          p_storage_paths: string[]
          p_text_content: string
          p_zalo_image_urls: string[]
          p_zalo_msg_id: string
          p_zalo_user_id: string
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

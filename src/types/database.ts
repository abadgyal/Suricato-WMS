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
    PostgrestVersion: "14.5"
  }
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
      categoria: {
        Row: {
          color: string
          id: string
          nombre: string
        }
        Insert: {
          color?: string
          id?: string
          nombre: string
        }
        Update: {
          color?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      cliente: {
        Row: {
          color: string
          contacto: string | null
          creado_en: string
          email: string | null
          id: string
          nombre: string
          parent_id: string | null
          telefono: string | null
        }
        Insert: {
          color?: string
          contacto?: string | null
          creado_en?: string
          email?: string | null
          id?: string
          nombre: string
          parent_id?: string | null
          telefono?: string | null
        }
        Update: {
          color?: string
          contacto?: string | null
          creado_en?: string
          email?: string | null
          id?: string
          nombre?: string
          parent_id?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
        ]
      }
      evento: {
        Row: {
          cliente_id: string | null
          creado_en: string
          creado_por: string
          estado: Database["public"]["Enums"]["estado_evento"]
          fecha_fin: string
          fecha_inicio: string
          id: string
          nombre: string
          notas: string | null
        }
        Insert: {
          cliente_id?: string | null
          creado_en?: string
          creado_por?: string
          estado?: Database["public"]["Enums"]["estado_evento"]
          fecha_fin: string
          fecha_inicio: string
          id?: string
          nombre: string
          notas?: string | null
        }
        Update: {
          cliente_id?: string | null
          creado_en?: string
          creado_por?: string
          estado?: Database["public"]["Enums"]["estado_evento"]
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          nombre?: string
          notas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      movimiento: {
        Row: {
          bucket_destino: string | null
          bucket_origen: Database["public"]["Enums"]["bucket"] | null
          cliente_id: string | null
          creado_en: string
          evento_id: string | null
          id: string
          motivo: string | null
          producto_id: string
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          unidades: number | null
          usuario_id: string
          valor_anterior: number | null
          valor_nuevo: number | null
        }
        Insert: {
          bucket_destino?: string | null
          bucket_origen?: Database["public"]["Enums"]["bucket"] | null
          cliente_id?: string | null
          creado_en?: string
          evento_id?: string | null
          id?: string
          motivo?: string | null
          producto_id: string
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          unidades?: number | null
          usuario_id: string
          valor_anterior?: number | null
          valor_nuevo?: number | null
        }
        Update: {
          bucket_destino?: string | null
          bucket_origen?: Database["public"]["Enums"]["bucket"] | null
          cliente_id?: string | null
          creado_en?: string
          evento_id?: string | null
          id?: string
          motivo?: string | null
          producto_id?: string
          tipo?: Database["public"]["Enums"]["tipo_movimiento"]
          unidades?: number | null
          usuario_id?: string
          valor_anterior?: number | null
          valor_nuevo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimiento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "evento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "v_conflictos_reserva"
            referencedColumns: ["evento_a"]
          },
          {
            foreignKeyName: "movimiento_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "v_conflictos_reserva"
            referencedColumns: ["evento_b"]
          },
          {
            foreignKeyName: "movimiento_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_producto_disponible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil: {
        Row: {
          activo: boolean
          creado_en: string
          es_principal: boolean
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol"]
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          es_principal?: boolean
          id: string
          nombre: string
          rol?: Database["public"]["Enums"]["rol"]
        }
        Update: {
          activo?: boolean
          creado_en?: string
          es_principal?: boolean
          id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["rol"]
        }
        Relationships: []
      }
      producto: {
        Row: {
          actualizado_en: string
          alto_cm: number | null
          ancho_cm: number | null
          baja_acumulada: number
          categoria_id: string
          cliente_id: string | null
          creado_en: string
          disponible: number
          en_evento: number
          en_reparacion: number
          foto_path: string | null
          id: string
          largo_cm: number | null
          nombre: string
          peso_kg: number | null
          stock_minimo: number
          ubicacion: string | null
        }
        Insert: {
          actualizado_en?: string
          alto_cm?: number | null
          ancho_cm?: number | null
          baja_acumulada?: number
          categoria_id: string
          cliente_id?: string | null
          creado_en?: string
          disponible?: number
          en_evento?: number
          en_reparacion?: number
          foto_path?: string | null
          id?: string
          largo_cm?: number | null
          nombre: string
          peso_kg?: number | null
          stock_minimo?: number
          ubicacion?: string | null
        }
        Update: {
          actualizado_en?: string
          alto_cm?: number | null
          ancho_cm?: number | null
          baja_acumulada?: number
          categoria_id?: string
          cliente_id?: string | null
          creado_en?: string
          disponible?: number
          en_evento?: number
          en_reparacion?: number
          foto_path?: string | null
          id?: string
          largo_cm?: number | null
          nombre?: string
          peso_kg?: number | null
          stock_minimo?: number
          ubicacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producto_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_categoria"
            referencedColumns: ["categoria_id"]
          },
          {
            foreignKeyName: "producto_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva: {
        Row: {
          creado_en: string
          creado_por: string
          estado: Database["public"]["Enums"]["estado_reserva"]
          evento_id: string
          id: string
          notas: string | null
          producto_id: string
          unidades: number
        }
        Insert: {
          creado_en?: string
          creado_por?: string
          estado?: Database["public"]["Enums"]["estado_reserva"]
          evento_id: string
          id?: string
          notas?: string | null
          producto_id: string
          unidades: number
        }
        Update: {
          creado_en?: string
          creado_por?: string
          estado?: Database["public"]["Enums"]["estado_reserva"]
          evento_id?: string
          id?: string
          notas?: string | null
          producto_id?: string
          unidades?: number
        }
        Relationships: [
          {
            foreignKeyName: "reserva_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "evento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "v_conflictos_reserva"
            referencedColumns: ["evento_a"]
          },
          {
            foreignKeyName: "reserva_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "v_conflictos_reserva"
            referencedColumns: ["evento_b"]
          },
          {
            foreignKeyName: "reserva_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_producto_disponible"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      pg_all_foreign_keys: {
        Row: {
          fk_columns: unknown[] | null
          fk_constraint_name: unknown
          fk_schema_name: unknown
          fk_table_name: unknown
          fk_table_oid: unknown
          is_deferrable: boolean | null
          is_deferred: boolean | null
          match_type: string | null
          on_delete: string | null
          on_update: string | null
          pk_columns: unknown[] | null
          pk_constraint_name: unknown
          pk_index_name: unknown
          pk_schema_name: unknown
          pk_table_name: unknown
          pk_table_oid: unknown
        }
        Relationships: []
      }
      tap_funky: {
        Row: {
          args: string | null
          is_definer: boolean | null
          is_strict: boolean | null
          is_visible: boolean | null
          kind: unknown
          langoid: unknown
          name: unknown
          oid: unknown
          owner: unknown
          returns: string | null
          returns_set: boolean | null
          schema: unknown
          volatility: string | null
        }
        Relationships: []
      }
      v_conflictos_reserva: {
        Row: {
          disponible: number | null
          evento_a: string | null
          evento_a_nombre: string | null
          evento_b: string | null
          evento_b_nombre: string | null
          producto: string | null
          producto_id: string | null
          reservado_solapado: number | null
          unidades_a: number | null
          unidades_b: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reserva_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_producto_disponible"
            referencedColumns: ["id"]
          },
        ]
      }
      v_movimiento_cliente: {
        Row: {
          bucket_destino: string | null
          bucket_origen: Database["public"]["Enums"]["bucket"] | null
          cliente_id: string | null
          creado_en: string | null
          evento: string | null
          evento_id: string | null
          id: string | null
          motivo: string | null
          producto: string | null
          producto_foto: string | null
          producto_id: string | null
          tipo: Database["public"]["Enums"]["tipo_movimiento"] | null
          unidades: number | null
          usuario: string | null
          usuario_id: string | null
          valor_anterior: number | null
          valor_nuevo: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimiento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
        ]
      }
      v_producto_disponible: {
        Row: {
          actualizado_en: string | null
          alto_cm: number | null
          ancho_cm: number | null
          baja_acumulada: number | null
          bajo_minimo: boolean | null
          categoria_id: string | null
          cliente_id: string | null
          creado_en: string | null
          disponible: number | null
          disponible_real: number | null
          en_evento: number | null
          en_reparacion: number | null
          foto_path: string | null
          id: string | null
          largo_cm: number | null
          nombre: string | null
          peso_kg: number | null
          reservado: number | null
          stock_minimo: number | null
          total: number | null
          ubicacion: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producto_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_categoria"
            referencedColumns: ["categoria_id"]
          },
          {
            foreignKeyName: "producto_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock_por_categoria: {
        Row: {
          categoria: string | null
          categoria_id: string | null
          color: string | null
          disponible: number | null
          en_evento: number | null
          en_reparacion: number | null
          n_productos: number | null
          total: number | null
        }
        Relationships: []
      }
      v_unidades_fuera_evento: {
        Row: {
          evento_id: string | null
          producto_id: string | null
          unidades_fuera: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimiento_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "evento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "v_conflictos_reserva"
            referencedColumns: ["evento_a"]
          },
          {
            foreignKeyName: "movimiento_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "v_conflictos_reserva"
            referencedColumns: ["evento_b"]
          },
          {
            foreignKeyName: "movimiento_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_producto_disponible"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _cleanup: { Args: never; Returns: boolean }
      _contract_on: { Args: { "": string }; Returns: unknown }
      _currtest: { Args: never; Returns: number }
      _db_privs: { Args: never; Returns: unknown[] }
      _extensions: { Args: never; Returns: unknown[] }
      _get: { Args: { "": string }; Returns: number }
      _get_latest: { Args: { "": string }; Returns: number[] }
      _get_note: { Args: { "": string }; Returns: string }
      _is_verbose: { Args: never; Returns: boolean }
      _prokind: { Args: { p_oid: unknown }; Returns: unknown }
      _query: { Args: { "": string }; Returns: string }
      _refine_vol: { Args: { "": string }; Returns: string }
      _retval: { Args: { "": string }; Returns: string }
      _table_privs: { Args: never; Returns: unknown[] }
      _temptypes: { Args: { "": string }; Returns: string }
      _todo: { Args: never; Returns: string }
      _wms_estado: {
        Args: {
          p: Database["public"]["Tables"]["producto"]["Row"]
          p_movimiento_id: string
        }
        Returns: Json
      }
      _wms_reservas_activas: {
        Args: { p_excluir?: string; p_producto_id: string }
        Returns: number
      }
      _wms_unidades_fuera: {
        Args: { p_evento_id: string; p_producto_id: string }
        Returns: number
      }
      ajustar: {
        Args: {
          p_bucket: string
          p_motivo: string
          p_producto_id: string
          p_valor_nuevo: number
        }
        Returns: Json
      }
      cancelar_reserva: { Args: { p_reserva_id: string }; Returns: Json }
      col_is_null:
        | {
            Args: {
              column_name: unknown
              description?: string
              schema_name: unknown
              table_name: unknown
            }
            Returns: string
          }
        | {
            Args: {
              column_name: unknown
              description?: string
              table_name: unknown
            }
            Returns: string
          }
      col_not_null:
        | {
            Args: {
              column_name: unknown
              description?: string
              schema_name: unknown
              table_name: unknown
            }
            Returns: string
          }
        | {
            Args: {
              column_name: unknown
              description?: string
              table_name: unknown
            }
            Returns: string
          }
      crear_reserva: {
        Args: {
          p_evento_id: string
          p_notas?: string
          p_producto_id: string
          p_unidades: number
        }
        Returns: Json
      }
      cumplir_evento: { Args: { p_evento_id: string }; Returns: Json }
      cumplir_reserva: { Args: { p_reserva_id: string }; Returns: Json }
      current_perfil_id: { Args: never; Returns: string }
      current_rol: { Args: never; Returns: Database["public"]["Enums"]["rol"] }
      dar_de_baja: {
        Args: {
          p_bucket_origen: string
          p_motivo: string
          p_producto_id: string
          p_unidades: number
        }
        Returns: Json
      }
      desactivar_usuario: { Args: { p_perfil_id: string }; Returns: Json }
      devolver: {
        Args: {
          p_evento_id: string
          p_motivo?: string
          p_ok: number
          p_perdido: number
          p_producto_id: string
          p_roto: number
        }
        Returns: Json
      }
      diag:
        | {
            Args: { msg: unknown }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { msg: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      diag_test_name: { Args: { "": string }; Returns: string }
      do_tap:
        | { Args: never; Returns: string[] }
        | { Args: { "": string }; Returns: string[] }
      fail:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      findfuncs: { Args: { "": string }; Returns: string[] }
      finish: { Args: { exception_on_failure?: boolean }; Returns: string[] }
      format_type_string: { Args: { "": string }; Returns: string }
      has_unique: { Args: { "": string }; Returns: string }
      in_todo: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_empty: { Args: { "": string }; Returns: string }
      isnt_empty: { Args: { "": string }; Returns: string }
      lives_ok: { Args: { "": string }; Returns: string }
      marcar_reparado: {
        Args: { p_producto_id: string; p_unidades: number }
        Returns: Json
      }
      no_plan: { Args: never; Returns: boolean[] }
      num_failed: { Args: never; Returns: number }
      os_name: { Args: never; Returns: string }
      pass:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      pg_version: { Args: never; Returns: string }
      pg_version_num: { Args: never; Returns: number }
      pgtap_version: { Args: never; Returns: number }
      registrar_entrada: {
        Args: {
          p_categoria_id?: string
          p_cliente_id?: string
          p_dimensiones?: Json
          p_foto_path?: string
          p_nombre?: string
          p_producto_id?: string
          p_stock_minimo?: number
          p_ubicacion?: string
          p_unidades: number
        }
        Returns: Json
      }
      runtests:
        | { Args: never; Returns: string[] }
        | { Args: { "": string }; Returns: string[] }
      salida_evento: {
        Args: { p_evento_id: string; p_producto_id: string; p_unidades: number }
        Returns: Json
      }
      skip:
        | { Args: { "": string }; Returns: string }
        | { Args: { how_many: number; why: string }; Returns: string }
      throws_ok: { Args: { "": string }; Returns: string }
      todo:
        | { Args: { how_many: number }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] }
        | { Args: { why: string }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] }
      todo_end: { Args: never; Returns: boolean[] }
      todo_start:
        | { Args: never; Returns: boolean[] }
        | { Args: { "": string }; Returns: boolean[] }
    }
    Enums: {
      bucket: "disponible" | "en_evento" | "en_reparacion"
      estado_evento: "planificado" | "en_curso" | "cerrado" | "cancelado"
      estado_reserva: "activa" | "cumplida" | "cancelada"
      rol: "admin" | "trabajador"
      tipo_movimiento:
        | "entrada"
        | "salida_evento"
        | "devolucion"
        | "ajuste"
        | "baja"
    }
    CompositeTypes: {
      _time_trial_type: {
        a_time: number | null
      }
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
      bucket: ["disponible", "en_evento", "en_reparacion"],
      estado_evento: ["planificado", "en_curso", "cerrado", "cancelado"],
      estado_reserva: ["activa", "cumplida", "cancelada"],
      rol: ["admin", "trabajador"],
      tipo_movimiento: [
        "entrada",
        "salida_evento",
        "devolucion",
        "ajuste",
        "baja",
      ],
    },
  },
} as const

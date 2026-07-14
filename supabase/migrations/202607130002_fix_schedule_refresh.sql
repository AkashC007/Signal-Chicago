create or replace function public.replace_scheduled_headways(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare inserted_count integer;
begin
    if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) = 0 then
        raise exception 'Scheduled headways must be a non-empty JSON array';
    end if;

    -- Supabase's safe-update guard requires an explicit predicate.
    -- route_code is NOT NULL, so this still replaces the complete baseline.
    delete from public.scheduled_headways
    where route_code is not null;

    insert into public.scheduled_headways (
        route_code, station_id, service_type, period_name, period_start,
        period_end, scheduled_headway_minutes, trips_sampled, feed_imported_at
    )
    select
        row.route_code,
        row.station_id,
        row.service_type,
        row.period_name,
        row.period_start,
        row.period_end,
        row.scheduled_headway_minutes,
        row.trips_sampled,
        row.feed_imported_at
    from jsonb_to_recordset(p_rows) as row(
        route_code text,
        station_id integer,
        service_type text,
        period_name text,
        period_start time,
        period_end time,
        scheduled_headway_minutes numeric,
        trips_sampled integer,
        feed_imported_at timestamptz
    );
    get diagnostics inserted_count = row_count;
    return inserted_count;
end;
$$;

revoke all on function public.replace_scheduled_headways(jsonb) from public, anon, authenticated;
grant execute on function public.replace_scheduled_headways(jsonb) to service_role;

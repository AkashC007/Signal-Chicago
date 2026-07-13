create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.station_cohort (
    station_id integer primary key,
    station_name text not null,
    reason text not null,
    display_order integer not null unique,
    active boolean not null default true
);

insert into public.station_cohort (station_id, station_name, reason, display_order)
values
    (40380, 'Clark/Lake', 'Downtown transfer hub serving six observed routes', 1),
    (41400, 'Roosevelt', 'South Loop transfer between Red, Green, and Orange', 2),
    (40900, 'Howard', 'North terminal serving Red, Purple, and Yellow', 3),
    (41320, 'Belmont', 'North Side transfer serving Red, Brown, and Purple', 4),
    (40890, 'O''Hare', 'Airport terminal on the Blue Line', 5),
    (40450, '95th/Dan Ryan', 'South terminal on the Red Line', 6),
    (41290, 'Kimball', 'Northwest terminal on the Brown Line', 7),
    (40140, 'Dempster-Skokie', 'Yellow Line terminal', 8),
    (40580, '54th/Cermak', 'Pink Line terminal', 9),
    (40120, '35th/Archer', 'Southwest Orange Line station', 10),
    (41120, '35th-Bronzeville-IIT', 'Green Line station connected to Illinois Tech', 11),
    (40020, 'Harlem/Lake', 'West terminal on the Green Line', 12)
on conflict (station_id) do update set
    station_name = excluded.station_name,
    reason = excluded.reason,
    display_order = excluded.display_order,
    active = true;

create table if not exists public.collection_runs (
    run_id uuid primary key,
    started_at timestamptz not null,
    completed_at timestamptz not null,
    stations_requested integer not null check (stations_requested between 1 and 50),
    stations_succeeded integer not null check (stations_succeeded >= 0),
    stations_failed integer not null check (stations_failed >= 0),
    predictions_loaded integer not null check (predictions_loaded >= 0),
    status text not null check (status in ('completed', 'completed_with_errors'))
);

create table if not exists public.collection_errors (
    run_id uuid not null references public.collection_runs(run_id) on delete cascade,
    station_id integer not null,
    error_message text not null,
    primary key (run_id, station_id)
);

create table if not exists public.train_arrival_predictions (
    snapshot_at timestamptz not null,
    station_id integer not null,
    stop_id integer not null,
    station_name text not null,
    platform_description text not null,
    run_number text not null,
    route_code text not null,
    destination_name text not null,
    prediction_generated_at timestamptz not null,
    predicted_arrival_at timestamptz not null,
    seconds_to_arrival integer not null check (seconds_to_arrival >= 0),
    is_approaching boolean not null,
    is_scheduled boolean not null,
    is_delayed boolean not null,
    latitude double precision,
    longitude double precision,
    heading integer,
    source_updated_at timestamptz not null default now(),
    primary key (snapshot_at, run_number, stop_id, predicted_arrival_at)
);

create index if not exists idx_prediction_station_run_time
    on public.train_arrival_predictions (station_id, stop_id, run_number, snapshot_at);
create index if not exists idx_prediction_route_time
    on public.train_arrival_predictions (route_code, snapshot_at desc);
create index if not exists idx_prediction_snapshot
    on public.train_arrival_predictions (snapshot_at desc);

create table if not exists public.route_reliability_daily (
    service_date date not null,
    route_code text not null,
    observations integer not null,
    tracked_train_instances integer not null,
    revision_count integer not null,
    avg_absolute_revision_minutes numeric(8, 2),
    p90_absolute_revision_minutes numeric(8, 2),
    delayed_prediction_pct numeric(6, 2),
    scheduled_prediction_pct numeric(6, 2),
    avg_expected_wait_minutes numeric(8, 2),
    avg_predicted_gap_minutes numeric(8, 2),
    max_predicted_gap_minutes numeric(8, 2),
    refreshed_at timestamptz not null default now(),
    primary key (service_date, route_code)
);

create table if not exists public.station_reliability_daily (
    service_date date not null,
    route_code text not null,
    station_id integer not null,
    station_name text not null,
    observations integer not null,
    tracked_train_instances integer not null,
    revision_count integer not null,
    avg_absolute_revision_minutes numeric(8, 2),
    p90_absolute_revision_minutes numeric(8, 2),
    delayed_prediction_pct numeric(6, 2),
    avg_expected_wait_minutes numeric(8, 2),
    avg_predicted_gap_minutes numeric(8, 2),
    max_predicted_gap_minutes numeric(8, 2),
    refreshed_at timestamptz not null default now(),
    primary key (service_date, route_code, station_id)
);

create table if not exists public.scheduled_headways (
    route_code text not null,
    station_id integer not null,
    service_type text not null check (service_type in ('weekday', 'saturday', 'sunday_holiday')),
    period_name text not null,
    period_start time not null,
    period_end time not null,
    scheduled_headway_minutes numeric(8, 2) not null check (scheduled_headway_minutes > 0),
    trips_sampled integer not null check (trips_sampled > 0),
    feed_imported_at timestamptz not null,
    primary key (route_code, station_id, service_type, period_name)
);

alter table public.station_cohort enable row level security;
alter table public.collection_runs enable row level security;
alter table public.collection_errors enable row level security;
alter table public.train_arrival_predictions enable row level security;
alter table public.route_reliability_daily enable row level security;
alter table public.station_reliability_daily enable row level security;
alter table public.scheduled_headways enable row level security;

revoke all on table public.station_cohort from anon, authenticated;
revoke all on table public.collection_runs from anon, authenticated;
revoke all on table public.collection_errors from anon, authenticated;
revoke all on table public.train_arrival_predictions from anon, authenticated;
revoke all on table public.route_reliability_daily from anon, authenticated;
revoke all on table public.station_reliability_daily from anon, authenticated;
revoke all on table public.scheduled_headways from anon, authenticated;

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

    delete from public.scheduled_headways;
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

create or replace function public.parse_cta_timestamp(value text)
returns timestamptz
language plpgsql
immutable
strict
set search_path = public
as $$
begin
    if value ~ '^[0-9]{8} [0-9]{2}:[0-9]{2}:[0-9]{2}$' then
        return make_timestamptz(
            substring(value, 1, 4)::integer,
            substring(value, 5, 2)::integer,
            substring(value, 7, 2)::integer,
            substring(value, 10, 2)::integer,
            substring(value, 13, 2)::integer,
            substring(value, 16, 2)::double precision,
            'America/Chicago'
        );
    end if;
    if value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$' then
        return value::timestamp at time zone 'America/Chicago';
    end if;
    raise exception 'Unexpected CTA timestamp format';
end;
$$;

create or replace function public.record_cta_snapshot(
    p_run_id uuid,
    p_started_at timestamptz,
    p_completed_at timestamptz,
    p_stations_requested integer,
    p_stations_succeeded integer,
    p_stations_failed integer,
    p_predictions jsonb,
    p_errors jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    inserted_count integer := 0;
begin
    if p_stations_requested < 1 or p_stations_requested > 50 then
        raise exception 'stations_requested must be between 1 and 50';
    end if;
    if jsonb_typeof(coalesce(p_predictions, '[]'::jsonb)) <> 'array' then
        raise exception 'predictions must be a JSON array';
    end if;

    with incoming as (
        select
            public.parse_cta_timestamp(x.snapshot_at) as snapshot_at,
            x.sta_id::integer as station_id,
            x.stp_id::integer as stop_id,
            x.sta_nm as station_name,
            x.stp_de as platform_description,
            x.rn as run_number,
            x.rt as route_code,
            x.dest_nm as destination_name,
            public.parse_cta_timestamp(x.prdt) as prediction_generated_at,
            public.parse_cta_timestamp(x.arr_t) as predicted_arrival_at,
            x.is_app = '1' as is_approaching,
            x.is_sch = '1' as is_scheduled,
            x.is_dly = '1' as is_delayed,
            nullif(x.lat, '')::double precision as latitude,
            nullif(x.lon, '')::double precision as longitude,
            nullif(x.heading, '')::integer as heading
        from jsonb_to_recordset(coalesce(p_predictions, '[]'::jsonb)) as x(
            snapshot_at text,
            sta_id text,
            stp_id text,
            sta_nm text,
            stp_de text,
            rn text,
            rt text,
            dest_nm text,
            prdt text,
            arr_t text,
            is_app text,
            is_sch text,
            is_dly text,
            lat text,
            lon text,
            heading text
        )
    ), inserted as (
        insert into public.train_arrival_predictions (
            snapshot_at, station_id, stop_id, station_name, platform_description,
            run_number, route_code, destination_name, prediction_generated_at,
            predicted_arrival_at, seconds_to_arrival, is_approaching, is_scheduled,
            is_delayed, latitude, longitude, heading, source_updated_at
        )
        select
            snapshot_at,
            station_id,
            stop_id,
            station_name,
            platform_description,
            run_number,
            route_code,
            destination_name,
            prediction_generated_at,
            predicted_arrival_at,
            greatest(0, extract(epoch from (predicted_arrival_at - snapshot_at))::integer),
            is_approaching,
            is_scheduled,
            is_delayed,
            latitude,
            longitude,
            heading,
            p_completed_at
        from incoming
        on conflict do nothing
        returning 1
    )
    select count(*) into inserted_count from inserted;

    insert into public.collection_runs (
        run_id, started_at, completed_at, stations_requested, stations_succeeded,
        stations_failed, predictions_loaded, status
    ) values (
        p_run_id, p_started_at, p_completed_at, p_stations_requested,
        p_stations_succeeded, p_stations_failed, inserted_count,
        case when p_stations_failed = 0 then 'completed' else 'completed_with_errors' end
    )
    on conflict (run_id) do nothing;

    insert into public.collection_errors (run_id, station_id, error_message)
    select p_run_id, x.station_id, left(x.error_message, 300)
    from jsonb_to_recordset(coalesce(p_errors, '[]'::jsonb)) as x(
        station_id integer,
        error_message text
    )
    on conflict do nothing;

    return jsonb_build_object(
        'stations_requested', p_stations_requested,
        'stations_succeeded', p_stations_succeeded,
        'stations_failed', p_stations_failed,
        'predictions_loaded', inserted_count
    );
end;
$$;

revoke all on function public.record_cta_snapshot(uuid, timestamptz, timestamptz, integer, integer, integer, jsonb, jsonb)
    from public, anon, authenticated;
grant execute on function public.record_cta_snapshot(uuid, timestamptz, timestamptz, integer, integer, integer, jsonb, jsonb)
    to service_role;

create or replace function public.refresh_daily_reliability(
    p_service_date date default ((now() at time zone 'America/Chicago')::date)
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from public.route_reliability_daily where service_date = p_service_date;
    delete from public.station_reliability_daily where service_date = p_service_date;

    with day_predictions as (
        select
            prediction.*,
            lag(predicted_arrival_at) over (
                partition by station_id, stop_id, run_number,
                    (predicted_arrival_at at time zone 'America/Chicago')::date
                order by snapshot_at
            ) as previous_predicted_arrival_at,
            lead(predicted_arrival_at) over (
                partition by snapshot_at, station_id, stop_id, route_code, destination_name
                order by predicted_arrival_at
            ) as following_predicted_arrival_at
        from public.train_arrival_predictions prediction
        where (snapshot_at at time zone 'America/Chicago')::date = p_service_date
    ), measured as (
        select
            *,
            abs(extract(epoch from (predicted_arrival_at - previous_predicted_arrival_at)) / 60.0)
                as absolute_revision_minutes,
            extract(epoch from (following_predicted_arrival_at - predicted_arrival_at)) / 60.0
                as predicted_gap_minutes
        from day_predictions
    )
    insert into public.route_reliability_daily (
        service_date, route_code, observations, tracked_train_instances,
        revision_count, avg_absolute_revision_minutes, p90_absolute_revision_minutes,
        delayed_prediction_pct, scheduled_prediction_pct, avg_expected_wait_minutes,
        avg_predicted_gap_minutes, max_predicted_gap_minutes, refreshed_at
    )
    select
        p_service_date,
        route_code,
        count(*)::integer,
        count(distinct (run_number, (predicted_arrival_at at time zone 'America/Chicago')::date))::integer,
        count(absolute_revision_minutes)::integer,
        round(avg(absolute_revision_minutes)::numeric, 2),
        round(percentile_cont(0.90) within group (order by absolute_revision_minutes)::numeric, 2),
        round(100.0 * avg(is_delayed::integer)::numeric, 2),
        round(100.0 * avg(is_scheduled::integer)::numeric, 2),
        round(avg(seconds_to_arrival / 60.0)::numeric, 2),
        round(avg(predicted_gap_minutes) filter (where predicted_gap_minutes between 0 and 90)::numeric, 2),
        round(max(predicted_gap_minutes) filter (where predicted_gap_minutes between 0 and 90)::numeric, 2),
        now()
    from measured
    group by route_code;

    with day_predictions as (
        select
            prediction.*,
            lag(predicted_arrival_at) over (
                partition by station_id, stop_id, run_number,
                    (predicted_arrival_at at time zone 'America/Chicago')::date
                order by snapshot_at
            ) as previous_predicted_arrival_at,
            lead(predicted_arrival_at) over (
                partition by snapshot_at, station_id, stop_id, route_code, destination_name
                order by predicted_arrival_at
            ) as following_predicted_arrival_at
        from public.train_arrival_predictions prediction
        where (snapshot_at at time zone 'America/Chicago')::date = p_service_date
    ), measured as (
        select
            *,
            abs(extract(epoch from (predicted_arrival_at - previous_predicted_arrival_at)) / 60.0)
                as absolute_revision_minutes,
            extract(epoch from (following_predicted_arrival_at - predicted_arrival_at)) / 60.0
                as predicted_gap_minutes
        from day_predictions
    )
    insert into public.station_reliability_daily (
        service_date, route_code, station_id, station_name, observations,
        tracked_train_instances, revision_count, avg_absolute_revision_minutes,
        p90_absolute_revision_minutes, delayed_prediction_pct,
        avg_expected_wait_minutes, avg_predicted_gap_minutes,
        max_predicted_gap_minutes, refreshed_at
    )
    select
        p_service_date,
        route_code,
        station_id,
        max(station_name),
        count(*)::integer,
        count(distinct (run_number, (predicted_arrival_at at time zone 'America/Chicago')::date))::integer,
        count(absolute_revision_minutes)::integer,
        round(avg(absolute_revision_minutes)::numeric, 2),
        round(percentile_cont(0.90) within group (order by absolute_revision_minutes)::numeric, 2),
        round(100.0 * avg(is_delayed::integer)::numeric, 2),
        round(avg(seconds_to_arrival / 60.0)::numeric, 2),
        round(avg(predicted_gap_minutes) filter (where predicted_gap_minutes between 0 and 90)::numeric, 2),
        round(max(predicted_gap_minutes) filter (where predicted_gap_minutes between 0 and 90)::numeric, 2),
        now()
    from measured
    group by route_code, station_id;
end;
$$;

revoke all on function public.refresh_daily_reliability(date) from public, anon, authenticated;
grant execute on function public.refresh_daily_reliability(date) to service_role;

create or replace function public.apply_prediction_retention(p_keep_days integer default 14)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    cutoff_date date;
    old_date date;
    deleted_count integer;
begin
    if p_keep_days < 7 or p_keep_days > 90 then
        raise exception 'Retention must be between 7 and 90 days';
    end if;
    cutoff_date := (now() at time zone 'America/Chicago')::date - p_keep_days;

    for old_date in
        select distinct (snapshot_at at time zone 'America/Chicago')::date
        from public.train_arrival_predictions
        where (snapshot_at at time zone 'America/Chicago')::date < cutoff_date
    loop
        perform public.refresh_daily_reliability(old_date);
    end loop;

    delete from public.train_arrival_predictions
    where (snapshot_at at time zone 'America/Chicago')::date < cutoff_date;
    get diagnostics deleted_count = row_count;
    return deleted_count;
end;
$$;

revoke all on function public.apply_prediction_retention(integer) from public, anon, authenticated;
grant execute on function public.apply_prediction_retention(integer) to service_role;

create or replace function public.get_public_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with latest_station_times as (
    select station_id, max(snapshot_at) as snapshot_at
    from public.train_arrival_predictions
    group by station_id
), latest_predictions as (
    select prediction.*
    from public.train_arrival_predictions prediction
    join latest_station_times latest
      on latest.station_id = prediction.station_id
     and latest.snapshot_at = prediction.snapshot_at
), latest_measured as (
    select
        prediction.*,
        extract(epoch from (
            lead(predicted_arrival_at) over (
                partition by snapshot_at, station_id, stop_id, route_code, destination_name
                order by predicted_arrival_at
            ) - predicted_arrival_at
        )) / 60.0 as predicted_gap_minutes
    from latest_predictions prediction
), route_live as (
    select
        route_code,
        count(*)::integer as predictions,
        count(distinct station_id)::integer as stations,
        round(avg(seconds_to_arrival / 60.0)::numeric, 2) as wait_minutes,
        round(100.0 * avg(is_scheduled::integer)::numeric, 2) as scheduled_pct,
        round(100.0 * avg(is_delayed::integer)::numeric, 2) as delayed_pct,
        round(100.0 * avg(is_approaching::integer)::numeric, 2) as approaching_pct,
        round(avg(predicted_gap_minutes) filter (where predicted_gap_minutes between 0 and 90)::numeric, 2)
            as predicted_gap_minutes,
        max(snapshot_at) as latest_snapshot_at
    from latest_measured
    group by route_code
), route_baseline as (
    select
        route_code,
        round(avg(avg_absolute_revision_minutes)::numeric, 2) as avg_revision_minutes,
        round(avg(p90_absolute_revision_minutes)::numeric, 2) as p90_revision_minutes,
        round(max(max_predicted_gap_minutes)::numeric, 2) as max_gap_minutes
    from public.route_reliability_daily
    where service_date >= (now() at time zone 'America/Chicago')::date - 13
    group by route_code
), current_schedule as (
    select
        schedule.route_code,
        round(avg(schedule.scheduled_headway_minutes)::numeric, 2) as scheduled_headway_minutes
    from public.scheduled_headways schedule
    where schedule.service_type = case
            when extract(isodow from now() at time zone 'America/Chicago') between 1 and 5 then 'weekday'
            when extract(isodow from now() at time zone 'America/Chicago') = 6 then 'saturday'
            else 'sunday_holiday'
        end
      and (now() at time zone 'America/Chicago')::time >= schedule.period_start
      and (now() at time zone 'America/Chicago')::time < schedule.period_end
    group by schedule.route_code
), route_payload as (
    select coalesce(jsonb_agg(jsonb_build_object(
        'code', live.route_code,
        'predictions', live.predictions,
        'stations', live.stations,
        'wait', live.wait_minutes,
        'scheduled', live.scheduled_pct,
        'delayed', live.delayed_pct,
        'approaching', live.approaching_pct,
        'latest_snapshot_at', live.latest_snapshot_at,
        'revision', baseline.avg_revision_minutes,
        'p90_revision', baseline.p90_revision_minutes,
        'gap', live.predicted_gap_minutes,
        'max_gap', baseline.max_gap_minutes,
        'scheduled_headway', schedule.scheduled_headway_minutes,
        'service_gap_index', round(
            live.predicted_gap_minutes / nullif(schedule.scheduled_headway_minutes, 0), 2
        )
    ) order by live.route_code), '[]'::jsonb) as value
    from route_live live
    left join route_baseline baseline using (route_code)
    left join current_schedule schedule using (route_code)
), station_payload as (
    select coalesce(jsonb_agg(to_jsonb(station_row) order by station_row.wait desc), '[]'::jsonb) as value
    from (
        select
            route_code as route,
            station_id,
            max(station_name) as station,
            count(*)::integer as arrivals,
            round(avg(seconds_to_arrival / 60.0)::numeric, 2) as wait,
            round(100.0 * avg(is_delayed::integer)::numeric, 2) as delayed,
            max(snapshot_at) as latest_snapshot_at
        from latest_predictions
        group by route_code, station_id
        order by wait desc
        limit 16
    ) station_row
), run_totals as (
    select
        coalesce(sum(predictions_loaded), 0)::bigint as predictions_total,
        count(*)::bigint as runs_total,
        coalesce(sum(stations_failed), 0)::bigint as station_failures_total,
        count(*) filter (where completed_at >= now() - interval '24 hours')::integer as runs_24h
    from public.collection_runs
), freshness as (
    select
        max(snapshot_at) as latest_prediction_at,
        round((extract(epoch from (now() - max(snapshot_at))) / 60.0)::numeric, 1) as age_minutes,
        case
            when max(snapshot_at) is null then 'missing'
            when now() - max(snapshot_at) <= interval '5 minutes' then 'fresh'
            when now() - max(snapshot_at) <= interval '15 minutes' then 'delayed'
            else 'stale'
        end as status
    from public.train_arrival_predictions
), coverage as (
    select
        (select count(*) from public.station_cohort where active)::integer as cohort_stations,
        (select count(distinct route_code) from latest_predictions)::integer as observed_routes
)
select jsonb_build_object(
    'generated_at', now(),
    'freshness', jsonb_build_object(
        'latest_prediction_at', freshness.latest_prediction_at,
        'age_minutes', freshness.age_minutes,
        'status', freshness.status
    ),
    'coverage', jsonb_build_object(
        'predictions_total', run_totals.predictions_total,
        'runs_total', run_totals.runs_total,
        'station_failures_total', run_totals.station_failures_total,
        'runs_24h', run_totals.runs_24h,
        'cohort_stations', coverage.cohort_stations,
        'observed_routes', coverage.observed_routes
    ),
    'routes', route_payload.value,
    'stations', station_payload.value
)
from route_payload, station_payload, run_totals, freshness, coverage;
$$;

revoke all on function public.get_public_dashboard() from public;
grant execute on function public.get_public_dashboard() to anon, authenticated;

do $$
declare existing_job bigint;
begin
    select jobid into existing_job from cron.job where jobname = 'signal-chicago-hourly-rollup';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
        'signal-chicago-hourly-rollup',
        '15 * * * *',
        $job$select public.refresh_daily_reliability((now() at time zone 'America/Chicago')::date);$job$
    );

    select jobid into existing_job from cron.job where jobname = 'signal-chicago-daily-retention';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
        'signal-chicago-daily-retention',
        '30 9 * * *',
        $job$select public.apply_prediction_retention(14);$job$
    );
end;
$$;

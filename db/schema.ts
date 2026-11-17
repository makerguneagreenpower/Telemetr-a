import {integer,real,sqliteTable,text,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const sessions=sqliteTable('sessions',{id:text('id').primaryKey(),owner:text('owner').notNull(),name:text('name').notNull(),createdAt:text('created_at').notNull(),objectKey:text('object_key').notNull(),carCategory:text('car_category'),carId:text('car_id'),sessionType:text('session_type'),eventDate:text('event_date'),sessionContext:text('session_context').default('race-day')});
export const removedPilots=sqliteTable('removed_pilots',{id:text('id').primaryKey(),owner:text('owner').notNull(),name:text('name').notNull(),removedAt:text('removed_at').notNull()});
export const raceReplays=sqliteTable('race_replays',{
 id:text('id').primaryKey(),
 owner:text('owner').notNull(),
 eventName:text('event_name').notNull(),
 runName:text('run_name').notNull(),
 circuitId:text('circuit_id').notNull(),
 circuitName:text('circuit_name').notNull(),
 trackLength:real('track_length').notNull(),
 eventDate:text('event_date').notNull(),
 createdAt:text('created_at').notNull(),
 objectKey:text('object_key').notNull(),
 bestLapSeconds:real('best_lap_seconds'),
 mgWh:real('mg_wh').notNull(),
 totalTimeSeconds:real('total_time_seconds').notNull(),
 lapCount:integer('lap_count').notNull(),
 telemetrySessionId:text('telemetry_session_id'),
});
export const circuits=sqliteTable('circuits',{
 id:text('id').primaryKey(),
 owner:text('owner').notNull(),
 circuitId:text('circuit_id').notNull(),
 name:text('name').notNull(),
 competition:text('competition').notNull(),
 source:text('source').notNull(),
 width:real('width').notNull(),
 length:real('length').notNull(),
 maxGrade:real('max_grade').notNull(),
 elevationRange:real('elevation_range').notNull(),
 objectKey:text('object_key').notNull(),
 updatedAt:text('updated_at').notNull(),
},table=>({circuitOwnerId:uniqueIndex('circuits_owner_circuit_id').on(table.owner,table.circuitId)}));

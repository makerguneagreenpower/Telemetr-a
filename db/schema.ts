import {sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const sessions=sqliteTable('sessions',{id:text('id').primaryKey(),owner:text('owner').notNull(),name:text('name').notNull(),createdAt:text('created_at').notNull(),objectKey:text('object_key').notNull(),carCategory:text('car_category')});

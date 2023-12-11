column_map = {
     16: 'bool',
     17: 'blob',
     20: 'bigint',
     21: 'smallint',
     23: 'int',
     25: 'text',
     700: 'real',
     701: 'double precision',
     1042: 'char',  # blank-padded CHAR
     1043: 'varchar',
     1082: 'date',
     1114: 'datetime',
     1184: 'datetime',
     1083: 'time',
     1266: 'time',
     1700: 'decimal',
     2950: 'uuid',  # UUID
},

postgres_types_mapping = {
     'BINARY': 'BYTEA',
     'BIT': 'BOOLEAN',
     'VARCHAR(MAX)': 'TEXT',
     'STRING': 'TEXT',
     'EMPTY': 'TEXT',
     'VARBINARY': 'BYTEA',
     'NVARCHAR': 'VARCHAR',
     'NTEXT': 'TEXT',
     'FLOAT': 'DOUBLE PRECISION',
     'DATETIME': 'TIMESTAMP(3)',
     'DATETIME2': 'TIMESTAMP',
     'DATETIMEOFFSET': 'TIMESTAMP(P) WITH TIME ZONE',
     'SMALLDATETIME': 'TIMESTAMP(0)',
     'TINYINT': 'SMALLINT',
     'UNIQUEIDENTIFIER': 'CHAR(16)',
     'ROWVERSION': 'BYTEA',
     'SMALLMONEY': 'MONEY',
     'IMAGE': 'BYTEA'
}

postgres_types = {
     'integer': ['bigint', 'int8', 'bigserial', 'serial8', 'integer', 'int', 'int4', 'smallint', 'int2', 'smallserial', 'serial2', 'serial', 'serial4'],
     'bit': ['bit', 'bit varying', 'varbit'],
     'boolean': ['boolean', 'bool'],
     'box': ['box'],
     'byte': ['bytea'],
     'char': ['character', 'char', 'character varying', 'varchar', 'text'],
     'network': ['cidr', 'inet'],
     'circle': ['circle'],
     'date': ['date'],
     'float': ['double precision', 'float8', 'numeric', 'decimal', 'real', 'float4'],
     'timespan': ['interval'],
     'text_json': ['json'],
     'binary_json': ['jsonb'],
     'line': ['line', 'lseg'],
     'macaddr': ['macaddr'],
     'money': ['money'],
     'path': ['path'],
     'log_seq': ['pg_lsn'],
     'point': ['point'],
     'polygon': ['polygon'],
     'time': ['time', 'time without time zone', 'time with time zone', 'timetz'],
     'datetime': ['timestamp', 'timestamp without time zone', 'timestamp with time zone', 'timestamptz'],
     'tsquery': ['tsquery'],
     'tsvector': ['tsvector'],
     'txid_snapshot': ['txid_snapshot'],
     'uuid': ['uuid'],
     'xml': ['xml']
}
import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

let pool;
export async function getPool() {
  pool ??= await oracledb.createPool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT,
    poolMin: 1,
    poolMax: 8,
  });
  return pool;
}

export async function query(sql, binds = {}) {
  const conn = await (await getPool()).getConnection();
  try {
    return (await conn.execute(sql, binds)).rows;
  } finally {
    await conn.close();
  }
}

export { oracledb };

-- Central table: one row per CSV line, original field names preserved.
-- FictiveIDNumber is NOT unique (one ID may carry several offence types),
-- so the row key is an internal identity column.
CREATE TABLE CRIME_RECORDS (
  ID                NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  FictiveIDNumber   VARCHAR2(64),
  Year              NUMBER(4),
  Quarter           VARCHAR2(2),
  YeshuvKod         VARCHAR2(20),
  Yeshuv            VARCHAR2(200 CHAR),
  PoliceDistrictKod VARCHAR2(20),
  PoliceDistrict    VARCHAR2(200 CHAR),
  PoliceMerhavKod   VARCHAR2(20),
  PoliceMerhav      VARCHAR2(200 CHAR),
  PoliceStationKod  VARCHAR2(20),
  PoliceStation     VARCHAR2(200 CHAR),
  municipalKod      VARCHAR2(20),
  municipalName     VARCHAR2(200 CHAR),
  StatisticAreaKod  VARCHAR2(20),
  StatisticArea     VARCHAR2(400 CHAR),
  StatisticGroupKod VARCHAR2(20),
  StatisticGroup    VARCHAR2(200 CHAR),
  StatisticTypeKod  VARCHAR2(20),
  StatisticType     VARCHAR2(400 CHAR)
);

CREATE INDEX CRIME_YESHUV_IX ON CRIME_RECORDS (YeshuvKod, Quarter);

-- Geographic helper table (external source: OpenStreetMap). The police file has no coordinates.
CREATE TABLE LOCALITY_GEO (
  YeshuvKod VARCHAR2(20) PRIMARY KEY,
  Yeshuv    VARCHAR2(200 CHAR),
  LAT       NUMBER(9,6),
  LON       NUMBER(9,6),
  SOURCE    VARCHAR2(40)
);

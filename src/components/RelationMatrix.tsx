import React from 'react';
import type { Party, RelationEntry } from '../types';

interface Props {
  parties: Party[];
  relations: RelationEntry[];
}

const relationColors: Record<string, string> = {
  alliance: '#1565C0',
  friendly: '#42A5F5',
  neutral: '#9E9E9E',
  tense: '#FF7043',
  hostile: '#C62828',
};

const relationLabels: Record<string, string> = {
  alliance: '联盟',
  friendly: '友好',
  neutral: '中立',
  tense: '紧张',
  hostile: '敌对',
};

function getRelation(from: string, to: string, relations: RelationEntry[]): RelationEntry | undefined {
  return relations.find((r) => r.from === from && r.to === to);
}

export const RelationMatrix: React.FC<Props> = ({ parties, relations }) => {
  const cellSize = 72;

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>派系关系矩阵</h2>
      <p style={styles.subtitle}>行 = 发起方，列 = 接收方 | 颜色深浅代表关系程度</p>

      <div style={{ overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `100px repeat(${parties.length}, ${cellSize}px)`,
            gridTemplateRows: `auto repeat(${parties.length}, ${cellSize}px)`,
            gap: '2px',
          }}
        >
          {/* 顶部空角 */}
          <div />
          {/* 列标题 */}
          {parties.map((p) => (
            <div
              key={`col-${p.id}`}
              style={{
                ...styles.headerCell,
                borderBottom: `3px solid ${p.color}`,
              }}
            >
              <span style={{ color: p.color, fontWeight: 700 }}>{p.abbreviation}</span>
            </div>
          ))}

          {/* 数据行 */}
          {parties.map((rowParty, rowIdx) => (
            <React.Fragment key={`row-${rowParty.id}`}>
              {/* 行标题 */}
              <div
                style={{
                  ...styles.headerCell,
                  borderRight: `3px solid ${rowParty.color}`,
                  justifyContent: 'flex-end',
                  paddingRight: 10,
                }}
              >
                <span style={{ color: rowParty.color, fontWeight: 700 }}>{rowParty.abbreviation}</span>
                <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>{rowParty.name}</span>
              </div>

              {/* 单元格 */}
              {parties.map((colParty, colIdx) => {
                if (rowIdx === colIdx) {
                  return (
                    <div
                      key={`${rowParty.id}-${colParty.id}`}
                      style={{
                        ...styles.cell,
                        backgroundColor: rowParty.color,
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      自身
                    </div>
                  );
                }

                const rel = getRelation(rowParty.id, colParty.id, relations);
                if (!rel) {
                  return (
                    <div key={`${rowParty.id}-${colParty.id}`} style={styles.cell}>
                      —
                    </div>
                  );
                }

                const bgColor = relationColors[rel.type] || '#666';
                const opacity = 0.3 + Math.abs(rel.score) / 100 * 0.7;

                return (
                  <div
                    key={`${rowParty.id}-${colParty.id}`}
                    style={{
                      ...styles.cell,
                      backgroundColor: bgColor,
                      opacity,
                      color: '#fff',
                      fontWeight: 600,
                      cursor: 'default',
                    }}
                    title={`${rowParty.name} → ${colParty.name}\n关系: ${relationLabels[rel.type]} (${rel.score})\n${rel.description}`}
                  >
                    <div style={{ fontSize: 11 }}>{relationLabels[rel.type]}</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{rel.score > 0 ? '+' : ''}{rel.score}</div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* 图例 */}
      <div style={styles.legend}>
        {Object.entries(relationLabels).map(([type, label]) => (
          <div key={type} style={styles.legendItem}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                backgroundColor: relationColors[type],
              }}
            />
            <span style={{ fontSize: 12, color: '#aaa' }}>{label}</span>
          </div>
        ))}
        <div style={styles.legendItem}>
          <span style={{ fontSize: 11, color: '#666' }}>透明度越高 = 关系越极端</span>
        </div>
      </div>
    </div>
  );
};

const FONT_SERIF = '"Noto Serif SC", "Source Han Serif SC", Georgia, serif';
const COLOR_GOLD = '#C0A882';
const COLOR_GOLD_DIM = '#B8A47C';
const COLOR_BORDER = 'rgba(192, 168, 130, 0.18)';

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(6px)',
    borderRadius: 4,
    border: `1px solid ${COLOR_BORDER}`,
    padding: 24,
    color: '#e0e0e0',
    boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
  },
  title: {
    margin: 0,
    fontSize: 20,
    color: COLOR_GOLD,
    fontWeight: 700,
    fontFamily: FONT_SERIF,
    letterSpacing: 2,
  },
  subtitle: {
    margin: '4px 0 16px',
    fontSize: 12,
    color: 'rgba(192,168,130,0.5)',
    fontFamily: FONT_SERIF,
  },
  headerCell: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    padding: '4px 0',
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    transition: 'transform 0.15s',
  },
  legend: {
    display: 'flex',
    gap: 16,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
};

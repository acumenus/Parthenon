package com.arcadia.DataQualityDashboard.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import javax.persistence.*;
import java.sql.Timestamp;
import java.util.Objects;

import static javax.persistence.FetchType.LAZY;
import static javax.persistence.GenerationType.SEQUENCE;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity(name = "data_quality_results")
public class DataQualityResult {
    @Id
    @SequenceGenerator(name = "data_quality_result_id_sequence", sequenceName = "data_quality_result_id_sequence")
    @GeneratedValue(strategy = SEQUENCE, generator = "data_quality_result_id_sequence")
    private Long id;

    @Column(nullable = false)
    private Timestamp time;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "file_id")
    private Long fileId;

    @JsonIgnore
    @OneToOne(optional = false, fetch = LAZY)
    @JoinColumn(name = "scan_id", referencedColumnName = "id")
    private DataQualityScan dataQualityScan;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        DataQualityResult that = (DataQualityResult) o;
        return Objects.equals(id, that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}

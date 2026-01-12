// ==== FULL FILE: ocpp/stop_policy_refund.go ====
package ocpp

import (
	"fmt"
	"math"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
)

type StopPolicyRefundItem struct {
	EVchargingID    uint    `json:"evcharging_id"`
	WeightPercent   float64 `json:"weight_percent"` // สัดส่วนที่ซื้อจริง (% of purchased_kwh)
	RemainingKwh    float64 `json:"remaining_kwh"`
	PricePerKwh     float64 `json:"price_per_kwh"` // ✅ ดึงจาก EVcharging.Price เท่านั้น
	RefundThisItem  float64 `json:"refund_this_item"`
	OldRemainingKwh float64 `json:"old_remaining_kwh"`
	DeltaKwh        float64 `json:"delta_kwh"`
}

type StopPolicyRefundResult struct {
	PaymentID         uint                  `json:"payment_id"`
	UserID            uint                  `json:"user_id"`
	SessionID         uint                  `json:"session_id"`
	TotalPurchasedKwh float64               `json:"total_purchased_kwh"`
	UsedKwh           float64               `json:"used_kwh"`
	RemainingTotalKwh float64               `json:"remaining_total_kwh"`
	RefundAmount      float64               `json:"refund_amount"`
	CoinBefore        float64               `json:"coin_before"`
	CoinAfter         float64               `json:"coin_after"`
	Items             []StopPolicyRefundItem `json:"items"`
	ClosedAt          time.Time             `json:"closed_at"`
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// ✅ ดึงราคา "บาท/kWh" จากตาราง EVcharging ตาม evcharging IDs (batch)
func getEVchargingPricesMap(tx *gorm.DB, evchargingIDs []uint) (map[uint]float64, error) {
	if tx == nil {
		return nil, fmt.Errorf("tx is nil")
	}
	unique := make(map[uint]struct{}, len(evchargingIDs))
	ids := make([]uint, 0, len(evchargingIDs))
	for _, id := range evchargingIDs {
		if id == 0 {
			continue
		}
		if _, ok := unique[id]; ok {
			continue
		}
		unique[id] = struct{}{}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return nil, fmt.Errorf("no evcharging ids")
	}

	type row struct {
		ID    uint    `gorm:"column:id"`
		Price float64 `gorm:"column:price"`
	}

	var rows []row
	if err := tx.Model(&entity.EVcharging{}).
		Select("id, price").
		Where("id IN ?", ids).
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	m := make(map[uint]float64, len(rows))
	for _, r := range rows {
		m[r.ID] = round2(r.Price)
	}
	// ตรวจว่าครบไหม
	for _, id := range ids {
		if _, ok := m[id]; !ok {
			return nil, fmt.Errorf("evcharging not found: id=%d", id)
		}
	}
	return m, nil
}

// ✅ คืนเงิน + เซฟ remaining_power เฉพาะ STOP-POLICY (BEFORE RemoteStop)
// ✅ FIX ตามที่คุณต้องการ: "ราคาเอาจาก entity.EVcharging.Price ตาม evcharging_id แล้วเอามาคูณ"
func RefundAndSaveRemainingOnStopPolicy(db *gorm.DB, chargePoint string, sess entity.ChargingSession, currentEnergyWh float64) (StopPolicyRefundResult, error) {
	if db == nil {
		db = config.DB()
	}
	if chargePoint == "" {
		return StopPolicyRefundResult{}, fmt.Errorf("chargePoint is required")
	}
	if sess.ID == 0 {
		return StopPolicyRefundResult{}, fmt.Errorf("session is invalid")
	}
	if sess.PaymentID == 0 {
		return StopPolicyRefundResult{}, fmt.Errorf("session.payment_id is 0")
	}

	startWh := sess.StartEnergy
	if startWh <= 0 {
		return StopPolicyRefundResult{}, fmt.Errorf("session.start_energy is 0 (cannot compute used/remaining)")
	}

	tx := db.Begin()
	if tx.Error != nil {
		return StopPolicyRefundResult{}, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// lock Payment
	var pay entity.Payment
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&pay, sess.PaymentID).Error; err != nil {
		tx.Rollback()
		return StopPolicyRefundResult{}, err
	}
	if pay.UserID == nil || *pay.UserID == 0 {
		tx.Rollback()
		return StopPolicyRefundResult{}, fmt.Errorf("payment has no user_id (payment_id=%d)", pay.ID)
	}

	// lock User
	var user entity.User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&user, *pay.UserID).Error; err != nil {
		tx.Rollback()
		return StopPolicyRefundResult{}, err
	}
	coinBefore := user.Coin

	// lock EVChargingPayments
	var evPays []entity.EVChargingPayment
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("payment_id = ?", pay.ID).
		Find(&evPays).Error; err != nil {
		tx.Rollback()
		return StopPolicyRefundResult{}, err
	}
	if len(evPays) == 0 {
		tx.Rollback()
		return StopPolicyRefundResult{}, fmt.Errorf("no EVChargingPayment found for payment_id=%d", pay.ID)
	}

	// totalPurchasedKwh
	totalPurchasedKwh := 0.0
	evIDs := make([]uint, 0, len(evPays))
	for _, p := range evPays {
		totalPurchasedKwh += p.Power
		evIDs = append(evIDs, p.EVchargingID)
	}
	totalPurchasedKwh = round2(totalPurchasedKwh)
	if totalPurchasedKwh <= 0 {
		tx.Rollback()
		return StopPolicyRefundResult{}, fmt.Errorf("totalPurchasedKwh is 0")
	}

	// ✅ ดึง price/kWh จาก entity.EVcharging.Price ตาม evcharging_id (batch)
	priceMap, err := getEVchargingPricesMap(tx, evIDs)
	if err != nil {
		tx.Rollback()
		return StopPolicyRefundResult{}, err
	}

	// usedKwh = (currentWh - startWh)/1000
	usedWh := currentEnergyWh - startWh
	if usedWh < 0 {
		usedWh = 0
	}
	usedKwh := round2(usedWh / 1000.0)

	// remainingTotalKwh = purchased - used
	remainingTotalKwh := totalPurchasedKwh - usedKwh
	if remainingTotalKwh < 0 {
		remainingTotalKwh = 0
	}
	remainingTotalKwh = round2(remainingTotalKwh)

	// =========================================================
	// ✅ กระจาย remainingTotalKwh ตาม ratio ของที่ซื้อ
	// remaining_i = remainingTotalKwh * (p.Power / totalPurchasedKwh)
	// round2 + ปรับตัวสุดท้ายให้รวมเท่ากับ remainingTotalKwh + clamp 0..p.Power
	// =========================================================
	remainingNew := make([]float64, len(evPays))
	sumRemain := 0.0

	for i, p := range evPays {
		ratio := 0.0
		if totalPurchasedKwh > 0 {
			ratio = p.Power / totalPurchasedKwh
		}
		r := round2(remainingTotalKwh * ratio)
		r = clamp(r, 0, round2(p.Power))
		remainingNew[i] = r
		sumRemain += r
	}
	sumRemain = round2(sumRemain)

	// ปรับตัวสุดท้ายให้ sumRemain ตรงกับ remainingTotalKwh (กัน drift)
	if len(evPays) >= 1 {
		diff := round2(remainingTotalKwh - sumRemain)
		last := len(evPays) - 1

		remainingNew[last] = round2(remainingNew[last] + diff)
		remainingNew[last] = clamp(remainingNew[last], 0, round2(evPays[last].Power))

		sumRemain = 0
		for _, r := range remainingNew {
			sumRemain += r
		}
		sumRemain = round2(sumRemain)

		// ถ้ายัง drift เพราะ clamp -> ยึดจาก per-item
		remainingTotalKwh = sumRemain
	}

	// update remaining_power + refund (delta)
	refund := 0.0
	items := make([]StopPolicyRefundItem, 0, len(evPays))

	for i, p := range evPays {
		evID := p.EVchargingID
		newRemaining := remainingNew[i]
		oldRemaining := round2(p.RemainingPower)

		// กันถูกเรียกซ้ำ: คืนเฉพาะส่วนต่างที่เพิ่มขึ้น
		delta := newRemaining - oldRemaining
		if delta < 0 {
			delta = 0
		}
		delta = round2(delta)

		// ✅ ราคาเอาจาก entity.EVcharging.Price ตาม evcharging_id
		pricePerKwh := priceMap[evID]

		// ✅ refund = deltaKwh * pricePerKwh
		refundThis := round2(delta * pricePerKwh)
		refund = round2(refund + refundThis)

		// เซฟ remaining_power
		if err := tx.Model(&entity.EVChargingPayment{}).
			Where("id = ? AND payment_id = ?", p.ID, pay.ID).
			Update("remaining_power", newRemaining).Error; err != nil {
			tx.Rollback()
			return StopPolicyRefundResult{}, err
		}

		weightPercent := 0.0
		if totalPurchasedKwh > 0 {
			weightPercent = round2((p.Power / totalPurchasedKwh) * 100.0)
		}

		items = append(items, StopPolicyRefundItem{
			EVchargingID:    evID,
			WeightPercent:   weightPercent,
			RemainingKwh:    newRemaining,
			PricePerKwh:     pricePerKwh,
			RefundThisItem:  refundThis,
			OldRemainingKwh: oldRemaining,
			DeltaKwh:        delta,
		})
	}

	// update coin
	if refund > 0 {
		if err := tx.Model(&entity.User{}).
			Where("id = ?", user.ID).
			UpdateColumn("coin", gorm.Expr("coin + ?", refund)).Error; err != nil {
			tx.Rollback()
			return StopPolicyRefundResult{}, err
		}
	}

	closedAt := time.Now()

	// ปิด session นี้
	if err := tx.Model(&entity.ChargingSession{}).
		Where("id = ? AND status = ?", sess.ID, true).
		Updates(map[string]interface{}{
			"status":   false,
			"end_time": closedAt,
		}).Error; err != nil {
		tx.Rollback()
		return StopPolicyRefundResult{}, err
	}

	if err := tx.Commit().Error; err != nil {
		tx.Rollback()
		return StopPolicyRefundResult{}, err
	}

	coinAfter := round2(coinBefore + refund)

	return StopPolicyRefundResult{
		PaymentID:         pay.ID,
		UserID:            user.ID,
		SessionID:         sess.ID,
		TotalPurchasedKwh: totalPurchasedKwh,
		UsedKwh:           usedKwh,
		RemainingTotalKwh: remainingTotalKwh,
		RefundAmount:      refund,
		CoinBefore:        round2(coinBefore),
		CoinAfter:         coinAfter,
		Items:             items,
		ClosedAt:          closedAt,
	}, nil
}

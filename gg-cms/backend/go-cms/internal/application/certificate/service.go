package certificate

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/google/uuid"
	"github.com/serenya/go-cms/internal/application/learnevents"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

const issuerName = "GeekGully"

var (
	ErrNotFound      = errors.New("certificate not found")
	ErrAlreadyRevoke = errors.New("certificate already revoked")
)

type CourseLookup interface {
	FindCourseMeta(ctx context.Context, courseID uint) (*entity.Course, error)
}

type Deps struct {
	Certificates repository.CertificateRepository
	Users        repository.UserRepository
	Courses      CourseLookup
	Tracker      learnevents.Tracker
	Notifier     learnevents.Notifier
	PublicBase   string
}

type Service interface {
	Issue(ctx context.Context, userID, courseID, enrollmentID uint, score *float64) error
	ListMine(ctx context.Context, userID uint) ([]*entity.Certificate, error)
	Verify(ctx context.Context, code string) (*entity.Certificate, error)
	GetForOwner(ctx context.Context, userID uint, isAdmin bool, code string) (*entity.Certificate, error)
	RenderPDF(cert *entity.Certificate) ([]byte, error)
	Revoke(ctx context.Context, code string, adminID uint, reason string) (*entity.Certificate, error)
	VerifyURL(code string) string
	LinkedInURL(cert *entity.Certificate) string
}

type service struct{ d Deps }

func NewService(d Deps) Service {
	if d.Tracker == nil {
		d.Tracker = learnevents.NopTracker{}
	}
	if d.Notifier == nil {
		d.Notifier = learnevents.NopNotifier{}
	}
	return &service{d: d}
}

func (s *service) Issue(ctx context.Context, userID, courseID, enrollmentID uint, score *float64) error {
	user, err := s.d.Users.FindByID(ctx, userID)
	if err != nil {
		return fmt.Errorf("certificate: load user: %w", err)
	}
	course, err := s.d.Courses.FindCourseMeta(ctx, courseID)
	if err != nil {
		return fmt.Errorf("certificate: load course: %w", err)
	}
	cert := &entity.Certificate{
		Code:          uuid.NewString(),
		UserID:        userID,
		CourseID:      courseID,
		EnrollmentID:  &enrollmentID,
		RecipientName: user.Name,
		CourseTitle:   course.Title,
		Score:         score,
		IssuedAt:      time.Now().UTC(),
	}
	created, _, err := s.d.Certificates.CreateIfAbsent(ctx, cert)
	if err != nil {
		return fmt.Errorf("certificate: create: %w", err)
	}
	if !created {
		return nil
	}
	cid := fmt.Sprintf("%d", courseID)
	ct := "COURSE"
	_ = s.d.Tracker.TrackEvent(ctx, learnevents.EventCertificateIssued, &userID, &cid, &ct, map[string]interface{}{"certificateId": cert.ID})
	link := "/certificates"
	_ = s.d.Notifier.Notify(ctx, userID, "Certificate issued", fmt.Sprintf("Your certificate for %q is ready.", course.Title), &link)
	return nil
}

func (s *service) ListMine(ctx context.Context, userID uint) ([]*entity.Certificate, error) {
	return s.d.Certificates.ListByUser(ctx, userID)
}

func (s *service) Verify(ctx context.Context, code string) (*entity.Certificate, error) {
	if _, err := uuid.Parse(code); err != nil {
		return nil, ErrNotFound
	}
	cert, err := s.d.Certificates.FindByCode(ctx, code)
	if err != nil || cert.Revoked {
		return nil, ErrNotFound
	}
	return cert, nil
}

func (s *service) GetForOwner(ctx context.Context, userID uint, isAdmin bool, code string) (*entity.Certificate, error) {
	if _, err := uuid.Parse(code); err != nil {
		return nil, ErrNotFound
	}
	cert, err := s.d.Certificates.FindByCode(ctx, code)
	if err != nil || (cert.UserID != userID && !isAdmin) {
		return nil, ErrNotFound
	}
	return cert, nil
}

func (s *service) Revoke(ctx context.Context, code string, adminID uint, reason string) (*entity.Certificate, error) {
	if _, err := uuid.Parse(code); err != nil {
		return nil, ErrNotFound
	}
	cert, err := s.d.Certificates.FindByCode(ctx, code)
	if err != nil {
		return nil, ErrNotFound
	}
	ok, err := s.d.Certificates.Revoke(ctx, code, adminID, reason, time.Now().UTC())
	if err != nil {
		return nil, fmt.Errorf("certificate: revoke: %w", err)
	}
	if !ok {
		return cert, ErrAlreadyRevoke
	}
	cert.Revoked = true
	return cert, nil
}

func (s *service) VerifyURL(code string) string {
	return strings.TrimRight(s.d.PublicBase, "/") + "/certificates/verify/" + code
}

func (s *service) LinkedInURL(cert *entity.Certificate) string {
	q := url.Values{}
	q.Set("startTask", "CERTIFICATION_NAME")
	q.Set("name", cert.CourseTitle)
	q.Set("organizationName", issuerName)
	q.Set("issueYear", fmt.Sprintf("%d", cert.IssuedAt.Year()))
	q.Set("issueMonth", fmt.Sprintf("%d", int(cert.IssuedAt.Month())))
	q.Set("certUrl", s.VerifyURL(cert.Code))
	q.Set("certId", cert.Code)
	return "https://www.linkedin.com/profile/add?" + q.Encode()
}

func (s *service) RenderPDF(cert *entity.Certificate) ([]byte, error) {
	pdf := fpdf.New("L", "mm", "A4", "")
	tr := pdf.UnicodeTranslatorFromDescriptor("")
	pdf.SetAutoPageBreak(false, 0)
	pdf.SetTitle("Certificate of Completion", false)
	pdf.AddPage()

	pdf.SetDrawColor(30, 64, 175)
	pdf.SetLineWidth(1.5)
	pdf.Rect(10, 10, 277, 190, "D")
	pdf.SetLineWidth(0.4)
	pdf.Rect(14, 14, 269, 182, "D")

	centered := func(y float64, font string, style string, size float64, text string, r, g, b int) {
		pdf.SetFont(font, style, size)
		pdf.SetTextColor(r, g, b)
		pdf.SetXY(20, y)
		pdf.CellFormat(257, size/2, tr(text), "", 0, "C", false, 0, "")
	}

	centered(38, "Helvetica", "B", 34, "Certificate of Completion", 30, 64, 175)
	centered(62, "Helvetica", "", 14, "This certifies that", 80, 80, 80)
	centered(80, "Helvetica", "B", 28, cert.RecipientName, 20, 20, 20)
	centered(104, "Helvetica", "", 14, "has successfully completed the course", 80, 80, 80)

	pdf.SetFont("Helvetica", "B", 22)
	pdf.SetTextColor(20, 20, 20)
	pdf.SetXY(30, 120)
	pdf.MultiCell(237, 10, tr(cert.CourseTitle), "", "C", false)

	if cert.Score != nil {
		centered(150, "Helvetica", "", 13, fmt.Sprintf("Assessment score: %.0f%%", *cert.Score), 80, 80, 80)
	}
	centered(162, "Helvetica", "", 12, "Issued "+cert.IssuedAt.Format("2 January 2006")+" by "+issuerName, 80, 80, 80)
	centered(176, "Helvetica", "", 9, "Certificate ID: "+cert.Code, 110, 110, 110)
	centered(182, "Helvetica", "", 9, "Verify: "+s.VerifyURL(cert.Code), 110, 110, 110)

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("certificate: render pdf: %w", err)
	}
	return buf.Bytes(), nil
}

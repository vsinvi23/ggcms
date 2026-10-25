package certificate

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type fakeCertRepo struct {
	repository.CertificateRepository
	byCode map[string]*entity.Certificate
}

func (f *fakeCertRepo) CreateIfAbsent(_ context.Context, c *entity.Certificate) (bool, *entity.Certificate, error) {
	for _, e := range f.byCode {
		if e.UserID == c.UserID && e.CourseID == c.CourseID {
			return false, e, nil
		}
	}
	c.ID = uint(len(f.byCode) + 1)
	f.byCode[c.Code] = c
	return true, c, nil
}
func (f *fakeCertRepo) FindByCode(_ context.Context, code string) (*entity.Certificate, error) {
	if c, ok := f.byCode[code]; ok {
		cp := *c
		return &cp, nil
	}
	return nil, errors.New("nf")
}
func (f *fakeCertRepo) Revoke(_ context.Context, code string, _ uint, _ string, _ time.Time) (bool, error) {
	c := f.byCode[code]
	if c.Revoked {
		return false, nil
	}
	c.Revoked = true
	return true, nil
}

type fakeUsers struct{ repository.UserRepository }

func (fakeUsers) FindByID(context.Context, uint) (*entity.User, error) {
	return &entity.User{ID: 1, Name: "Ada Lovelace", Email: "ada@example.com"}, nil
}

type fakeCourses struct{}

func (fakeCourses) FindCourseMeta(context.Context, uint) (*entity.Course, error) {
	return &entity.Course{ID: 9, Title: "Go Basics"}, nil
}

type rec struct{ events, notes int }

func (r *rec) TrackEvent(context.Context, string, *uint, *string, *string, map[string]interface{}) error {
	r.events++
	return nil
}
func (r *rec) Notify(context.Context, uint, string, string, *string) error { r.notes++; return nil }

func newSvc() (Service, *fakeCertRepo, *rec) {
	repo := &fakeCertRepo{byCode: map[string]*entity.Certificate{}}
	r := &rec{}
	return NewService(Deps{Certificates: repo, Users: fakeUsers{}, Courses: fakeCourses{}, Tracker: r, Notifier: r, PublicBase: "https://geekgully.com/"}), repo, r
}

func onlyCode(repo *fakeCertRepo) string {
	for c := range repo.byCode {
		return c
	}
	return ""
}

func TestIssueOnce(t *testing.T) {
	svc, repo, r := newSvc()
	ctx := context.Background()
	score := 90.0
	for i := 0; i < 3; i++ {
		if err := svc.Issue(ctx, 1, 9, 4, &score); err != nil {
			t.Fatal(err)
		}
	}
	if len(repo.byCode) != 1 || r.events != 1 || r.notes != 1 {
		t.Fatalf("certificate must be issued once: certs=%d events=%d notes=%d", len(repo.byCode), r.events, r.notes)
	}
	code := onlyCode(repo)
	c := repo.byCode[code]
	if _, err := uuid.Parse(code); err != nil || c.RecipientName != "Ada Lovelace" || c.CourseTitle != "Go Basics" {
		t.Fatalf("bad certificate: %+v", c)
	}
}

func TestVerifyHidesRevokedUnknownAndMalformed(t *testing.T) {
	svc, repo, _ := newSvc()
	ctx := context.Background()
	_ = svc.Issue(ctx, 1, 9, 4, nil)
	code := onlyCode(repo)
	if c, err := svc.Verify(ctx, code); err != nil || c.CourseTitle != "Go Basics" {
		t.Fatalf("valid cert should verify: %v", err)
	}
	if _, err := svc.Verify(ctx, uuid.NewString()); !errors.Is(err, ErrNotFound) {
		t.Fatal("unknown code must be not found")
	}
	if _, err := svc.Verify(ctx, "1"); !errors.Is(err, ErrNotFound) {
		t.Fatal("malformed code must be not found")
	}
	if _, err := svc.Revoke(ctx, code, 99, "fraud"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Verify(ctx, code); !errors.Is(err, ErrNotFound) {
		t.Fatal("revoked cert must not verify")
	}
	if _, err := svc.Revoke(ctx, code, 99, "again"); !errors.Is(err, ErrAlreadyRevoke) {
		t.Fatalf("got %v", err)
	}
}

func TestOwnerOnlyAccessAndPDF(t *testing.T) {
	svc, repo, _ := newSvc()
	ctx := context.Background()
	_ = svc.Issue(ctx, 1, 9, 4, nil)
	code := onlyCode(repo)
	if _, err := svc.GetForOwner(ctx, 2, false, code); !errors.Is(err, ErrNotFound) {
		t.Fatal("non-owner must get not found")
	}
	cert, err := svc.GetForOwner(ctx, 1, false, code)
	if err != nil {
		t.Fatal(err)
	}
	pdf, err := svc.RenderPDF(cert)
	if err != nil || !strings.HasPrefix(string(pdf), "%PDF") {
		t.Fatalf("pdf render failed: %v", err)
	}
	li := svc.LinkedInURL(cert)
	if !strings.HasPrefix(li, "https://www.linkedin.com/profile/add?") || !strings.Contains(li, "certId="+code) {
		t.Fatalf("bad linkedin url: %s", li)
	}
	if svc.VerifyURL(code) != "https://geekgully.com/certificates/verify/"+code {
		t.Fatalf("bad verify url: %s", svc.VerifyURL(code))
	}
}

package http

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	aisvc "github.com/serenya/go-cms/internal/application/ai"
	analyticssvc "github.com/serenya/go-cms/internal/application/analytics"
	auditsvc "github.com/serenya/go-cms/internal/application/audit"
	authsvc "github.com/serenya/go-cms/internal/application/auth"
	"github.com/serenya/go-cms/internal/application/identity"
	categorysvc "github.com/serenya/go-cms/internal/application/category"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	commentsvc "github.com/serenya/go-cms/internal/application/comment"
	ctsvc "github.com/serenya/go-cms/internal/application/contenttype"
	domainsvc "github.com/serenya/go-cms/internal/application/domain"
	engagementsvc "github.com/serenya/go-cms/internal/application/engagement"
	assessmentsvc "github.com/serenya/go-cms/internal/application/assessment"
	certificatesvc "github.com/serenya/go-cms/internal/application/certificate"
	enrollmentsvc "github.com/serenya/go-cms/internal/application/enrollment"
	groupsvc "github.com/serenya/go-cms/internal/application/group"
	lpsvc "github.com/serenya/go-cms/internal/application/learningpath"
	lessonsvc "github.com/serenya/go-cms/internal/application/lesson"
	notificationsvc "github.com/serenya/go-cms/internal/application/notification"
	oauthsvc "github.com/serenya/go-cms/internal/application/oauth"
	personalizationsvc "github.com/serenya/go-cms/internal/application/personalization"
	searchsvc "github.com/serenya/go-cms/internal/application/search"
	seosvc "github.com/serenya/go-cms/internal/application/seo"
	sectionsvc "github.com/serenya/go-cms/internal/application/section"
	settingssvc "github.com/serenya/go-cms/internal/application/settings"
	tagsvc "github.com/serenya/go-cms/internal/application/tag"
	tasksvc "github.com/serenya/go-cms/internal/application/task"
	topicsvc "github.com/serenya/go-cms/internal/application/topic"
	usersvc "github.com/serenya/go-cms/internal/application/user"
	gqlhandler "github.com/serenya/go-cms/internal/interfaces/graphql"
	"github.com/serenya/go-cms/internal/interfaces/http/handler"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/config"
	"github.com/serenya/go-cms/pkg/metrics"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	jwtpkg "github.com/serenya/go-cms/pkg/jwt"
)

// Services groups all application service interfaces needed by the router.
type Services struct {
	Auth            authsvc.Service
	User            usersvc.Service
	Group           groupsvc.Service
	Category        categorysvc.Service
	CMS             cmssvc.Service
	Section         sectionsvc.Service
	Lesson          lessonsvc.Service
	Enrollment      enrollmentsvc.Service
	// learning-loop:services
	Assessment  assessmentsvc.Service
	Certificate certificatesvc.Service
	// /learning-loop:services
	Task            tasksvc.Service
	Notification    notificationsvc.Service
	Comment         commentsvc.Service
	Analytics       analyticssvc.Service
	Tag             tagsvc.Service
	Topic           topicsvc.Service
	Reaction        engagementsvc.ReactionService
	Note            engagementsvc.NoteService
	Favourite       engagementsvc.FavouriteService
	Highlight       engagementsvc.HighlightService
	ContentType     ctsvc.Service
	Domain          domainsvc.Service
	LearningPath    lpsvc.Service
	Audit           auditsvc.Service
	OAuth           oauthsvc.Service
	Session         *identity.SessionGuard
	Settings        settingssvc.Service
	Personalization personalizationsvc.Service
	Search          searchsvc.Service
	SEO             seosvc.Service
	// ===== NOTIF/ANALYTICS/SELF-SERVICE (services) =====
	SelfService usersvc.SelfService
	Metrics     *metrics.Registry
	// ===== END NOTIF/ANALYTICS/SELF-SERVICE (services) =====
	// ===== AI LAYER (services) =====
	AI aisvc.Service
	// ===== END AI LAYER (services) =====
}

// NewRouter wires all services to handlers and returns a configured Gin engine.
func NewRouter(cfg *config.Config, jwtManager *jwtpkg.Manager, svcs Services) (*gin.Engine, error) {
	gin.SetMode(cfg.Server.GinMode)

	r := gin.New()
	var trustedProxies []string
	for _, t := range strings.Split(os.Getenv("TRUSTED_PROXIES"), ",") {
		if t = strings.TrimSpace(t); t != "" {
			trustedProxies = append(trustedProxies, t)
		}
	}
	if err := r.SetTrustedProxies(trustedProxies); err != nil {
		return nil, err
	}
	// ===== NOTIF/ANALYTICS/SELF-SERVICE (middleware) =====
	r.Use(middleware.RequestID())
	if svcs.Metrics != nil {
		r.Use(middleware.Metrics(svcs.Metrics))
	}
	if svcs.Notification != nil {
		r.Use(handler.NewNotifyEvents(svcs.Notification, svcs.CMS, svcs.Comment, svcs.User).Middleware())
	}
	// ===== END NOTIF/ANALYTICS/SELF-SERVICE (middleware) =====
	r.Use(middleware.Logger())
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.CORS())
	r.Use(gin.Recovery())
	// Canonical Domain Redirect Middleware (Redirect .run.app requests to https://geekgully.com)
	// Skip redirecting /api/ requests so API calls and file upload payloads are never altered or stripped.
	r.Use(func(c *gin.Context) {
		host := c.Request.Host
		if strings.Contains(host, ".run.app") && !strings.HasPrefix(c.Request.URL.Path, "/api/") {
			target := "https://geekgully.com" + c.Request.URL.String()
			c.Redirect(http.StatusPermanentRedirect, target)
			c.Abort()
			return
		}
		c.Next()
	})
	// Attach audit service to every request context so handlers can call middleware.LogAudit
	r.Use(middleware.AuditMiddleware(svcs.Audit))
	r.Use(middleware.DenialAudit(svcs.Audit, 5*time.Minute))
	if os.Getenv("REDIS_URL") != "" {
		log.Println("WARNING: REDIS_URL is set but no shared rate limiter is built in; limits remain per instance")
	}
	recoveryCIDRs, err := middleware.ParseCIDRs(cfg.Recovery.AllowedCIDRs)
	if err != nil {
		return nil, err
	}

	// Serve uploaded files statically
	uploads := r.Group("/uploads", middleware.UploadHeaders())
	uploads.StaticFS("/", gin.Dir(cfg.Upload.Dir, false))


	// Set JS and CSS MIME types for static assets if needed
	r.Use(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/assets/") {
			if strings.HasSuffix(c.Request.URL.Path, ".js") {
				c.Header("Content-Type", "application/javascript; charset=utf-8")
			} else if strings.HasSuffix(c.Request.URL.Path, ".css") {
				c.Header("Content-Type", "text/css; charset=utf-8")
			}
		}
		c.Next()
	})

	// Serve React SPA frontend if dist directory exists
	if _, err := os.Stat("dist"); err == nil {
		r.Static("/assets", "dist/assets")
	}

	// GraphQL endpoint (public — for content browsing, rate-limited against scraping)
	gql, err := gqlhandler.NewHandler(svcs.CMS, svcs.Category)
	if err != nil {
		return nil, err
	}
	r.POST("/graphql", middleware.PublicRateLimit(), gql.Handle)

	// Initialise all HTTP handlers
	authH := handler.NewAuthHandler(svcs.Auth)
	oauthH := handler.NewOAuthHandler(svcs.OAuth, cfg.OAuth.FrontendURL, cfg.Auth.LoginReauthWindow)
	userH := handler.NewUserHandler(svcs.User)
	groupH := handler.NewGroupHandler(svcs.Group)
	catH := handler.NewCategoryHandler(svcs.Category)
	cmsH := handler.NewCMSHandler(svcs.CMS, svcs.Task, svcs.Topic)
	secH := handler.NewSectionHandler(svcs.Section, svcs.CMS)
	lesH := handler.NewLessonHandler(svcs.Lesson, svcs.Section, svcs.CMS)
	enrH := handler.NewEnrollmentHandler(svcs.Enrollment)
	// learning-loop:handlers
	assessH := handler.NewAssessmentHandler(svcs.Assessment)
	certH := handler.NewCertificateHandler(svcs.Certificate)
	// /learning-loop:handlers
	taskH := handler.NewTaskHandler(svcs.Task)
	notifH := handler.NewNotificationHandler(svcs.Notification)
	commH := handler.NewCommentHandler(svcs.Comment, svcs.CMS)
	mediaH := handler.NewMediaHandler(cfg.Upload, svcs.Settings)
	settingsH := handler.NewSettingsHandler(svcs.Settings)
	pubH := handler.NewPublicHandler(svcs.CMS, svcs.Category, svcs.Analytics)
	analyticsH := handler.NewAnalyticsHandler(svcs.Analytics)
	tagH := handler.NewTagHandler(svcs.Tag)
	topicH := handler.NewTopicHandler(svcs.Topic, svcs.CMS)
	engH := handler.NewEngagementHandler(svcs.Reaction, svcs.Note, svcs.Favourite, svcs.Highlight)
	ctH := handler.NewContentTypeHandler(svcs.ContentType)
	domainH := handler.NewDomainHandler(svcs.Domain)
	lpH := handler.NewLearningPathHandler(svcs.LearningPath)
	auditH := handler.NewAuditHandler(svcs.Audit)
	logH := handler.NewLogHandler(svcs.Settings)
	personH := handler.NewPersonalizationHandler(svcs.Personalization)
	// search-seo:handlers
	lessonPreview := handler.ParseLessonPreview(os.Getenv("PUBLIC_LESSON_PREVIEW"))
	secH.SetLessonPreview(lessonPreview)
	pubH.SetLessonPreview(lessonPreview)
	searchH := handler.NewSearchHandler(svcs.Search)
	seoH := handler.NewSEOHandler(svcs.SEO, "dist/index.html")
	// /search-seo:handlers
	aiH := handler.NewAIHandler(svcs.AI)
	importH := handler.NewImportHandler(svcs.CMS, svcs.Task, svcs.Section, svcs.Lesson, svcs.Category, svcs.LearningPath, svcs.User, svcs.Settings)

	handler.ConfigureAuthCookies(cfg.Auth.CookieSecure, cfg.Auth.CookieDomain)
	authMW := middleware.Auth(jwtManager, svcs.Session)
	adminRecoveryMW := middleware.AdminRecoverySecret(cfg.Recovery.AdminRecoverySecret)

	api := r.Group("/api")
	{
		// ----- Health check (public — used by Docker HEALTHCHECK) -----
		api.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})

		// ----- Auth (public) — email/password -----
		api.POST("/auth/local", middleware.AuthRateLimit(), authH.Login)
		api.POST("/auth/local/register", middleware.AuthRateLimit(), authH.Register)
		api.POST("/auth/forgot-password", middleware.AuthRateLimit(), authH.ForgotPassword)
		api.POST("/auth/reset-password", middleware.AuthRateLimit(), authH.ResetPassword)

		// ===== AUTH / IDENTITY ROUTES (session model, email verification, social login) =====
		api.POST("/auth/refresh", middleware.AuthRateLimit(), middleware.CSRF(), authH.Refresh)
		api.POST("/auth/logout", middleware.CSRF(), authH.Logout)
		api.POST("/auth/email/verify", middleware.AuthRateLimit(), authH.VerifyEmail)
		api.GET("/auth/providers", middleware.PublicRateLimit(), oauthH.Providers)
		api.GET("/auth/:provider/start", middleware.AuthRateLimit(), oauthH.Start)
		api.GET("/auth/:provider/callback", middleware.AuthRateLimit(), oauthH.Callback)
		api.POST("/auth/link/confirm", middleware.AuthRateLimit(), oauthH.ConfirmLink)
		api.POST("/auth/link/email", middleware.AuthRateLimit(), oauthH.SendLinkEmail)
		api.POST("/auth/social/email", middleware.AuthRateLimit(), oauthH.SubmitSignupEmail)
		// ===== END AUTH / IDENTITY ROUTES =====

		// ===== NOTIF/ANALYTICS/SELF-SERVICE ROUTES (public) =====
		meH := handler.NewMeHandler(svcs.SelfService, svcs.Notification, svcs.Auth, cfg.Auth.LoginReauthWindow, dto.RetentionPolicyResponse{
			ConsentPolicyVersion:   cfg.Platform.ConsentPolicyVersion,
			AnalyticsRawEventsDays: cfg.Platform.AnalyticsRawRetentionDays,
			AnalyticsRollupDays:    cfg.Platform.AnalyticsRollupRetentionDays,
			ReadNotificationsDays:  cfg.Platform.NotificationRetentionDays,
			SentEmailLogDays:       cfg.Platform.EmailRetentionDays,
			AccountDeletion:        "Account deletion is immediate: personal data, analytics events, notes, highlights, favourites and reactions are purged; the account row is anonymised.",
		})
		api.POST("/analytics/events", middleware.AnalyticsIngestRateLimit(), middleware.OptionalAuth(jwtManager, svcs.Session), analyticsH.Ingest)
		api.GET("/privacy/retention", middleware.PublicRateLimit(), meH.Retention)
		api.GET("/notifications/unsubscribe", middleware.PublicRateLimit(), notifH.UnsubscribePage)
		api.POST("/notifications/unsubscribe", middleware.PublicRateLimit(), notifH.Unsubscribe)
		if svcs.Metrics != nil && cfg.Platform.MetricsAddr == "" {
			r.GET("/metrics", middleware.MetricsGuard(cfg.Platform.MetricsToken, authMW, middleware.AdminOnly()), gin.WrapH(svcs.Metrics.Handler()))
		}
		// ===== END NOTIF/ANALYTICS/SELF-SERVICE ROUTES (public) =====

		// ----- Feature flags (public — rate-limited) -----
		api.GET("/features", middleware.PublicRateLimit(), settingsH.GetFeatures)

		// ----- Content types (public read, rate-limited) -----
		api.GET("/content-types", middleware.PublicRateLimit(), ctH.GetAll)

		// ----- Tags (public read) -----
		api.GET("/tags", middleware.PublicRateLimit(), tagH.GetAll)

		// ----- Topics (public read, rate-limited) -----
		api.GET("/topics", middleware.PublicRateLimit(), topicH.GetAll)
		api.GET("/topics/:id", middleware.PublicRateLimit(), topicH.GetByID)
		api.GET("/topics/:id/relationships", middleware.PublicRateLimit(), topicH.GetRelationships)
		api.GET("/topics/:id/content", middleware.PublicRateLimit(), topicH.GetTopicContent)
		api.GET("/cms/:id/topics", middleware.PublicRateLimit(), topicH.GetContentTopics)


		// ----- Sections (public read — course curriculum preview) -----
		api.GET("/sections", middleware.PublicRateLimit(), middleware.OptionalAuth(jwtManager, svcs.Session), secH.GetAll)

		// ----- Categories (public read) -----
		api.GET("/categories", middleware.PublicRateLimit(), catH.GetAll)
		api.GET("/categories/:id", middleware.PublicRateLimit(), catH.GetByID)

		// ----- Domains (public read) -----
		api.GET("/domains", middleware.PublicRateLimit(), domainH.GetAll)

		// ----- Learning paths (public read) -----
		api.GET("/learning-paths", middleware.PublicRateLimit(), lpH.GetAll)
		api.GET("/learning-paths/:id", middleware.PublicRateLimit(), lpH.GetByID)
		// learning-loop:public
		api.GET("/public/certificates/:code", middleware.PublicRateLimit(), middleware.CertVerifyRateLimit(), certH.Verify)
		// /learning-loop:public

		// ----- Review comments (authenticated only — see protected group) -----


		// ----- Admin break-glass password recovery (secret-header auth, NOT JWT) -----
		// For when the master admin is locked out and can't rely on email delivery
		// or a JWT — protected by X-Admin-Recovery-Secret instead of authMW.
		api.POST("/admin/recover-password", middleware.StrictRateLimit(), middleware.RecoveryIPAllowList(recoveryCIDRs), adminRecoveryMW, authH.RecoverPassword)

		// ----- Public content (no auth, rate-limited against scraping) -----
		pub := api.Group("/public", middleware.PublicRateLimit(), middleware.OptionalAuth(jwtManager, svcs.Session))
		{
			pub.GET("/articles", pubH.GetPublicArticles)
			pub.GET("/articles/category/:slug", pubH.GetPublicArticlesByCategory)
			pub.GET("/articles/:id", pubH.GetPublicArticle)
			pub.GET("/courses", pubH.GetPublicCourses)
			pub.GET("/courses/category/:slug", pubH.GetPublicCoursesByCategory)
			pub.GET("/courses/:id", pubH.GetPublicCourse)
			// Unified CMS endpoint (type=ARTICLE|COURSE)
			pub.GET("/cms", pubH.GetPublicCMS)
			pub.GET("/cms/:id", pubH.GetPublicCMSByID)
			// search-seo:public-routes
			pub.GET("/search", searchH.Search)
			pub.GET("/search/suggest", searchH.Suggest)
			// /search-seo:public-routes
		}

		// ----- Protected routes -----
		p := api.Group("/")
		p.Use(authMW)
		p.Use(middleware.CSRF())
		{
			// Current user
			p.GET("users/me", authH.Me)
			// ===== AUTH / IDENTITY (authenticated) =====
			p.POST("auth/logout-all", authH.LogoutAll)
			p.POST("auth/reauth", middleware.AuthRateLimit(), authH.Reauth)
			p.POST("auth/email/resend", middleware.AuthRateLimit(), authH.ResendVerification)
			p.POST("users/me/password", middleware.AuthRateLimit(), authH.ChangePassword)
			p.GET("users/me/identities", oauthH.ListIdentities)
			p.POST("users/me/identities/:provider/link", middleware.AuthRateLimit(), oauthH.StartLink)
			p.DELETE("users/me/identities/:provider", oauthH.Unlink)
			// ===== END AUTH / IDENTITY (authenticated) =====

			// ===== NOTIF/ANALYTICS/SELF-SERVICE ROUTES (authenticated) =====
			p.PUT("users/me", meH.UpdateProfile)
			p.GET("users/me/consent", meH.GetConsent)
			p.POST("users/me/consent", meH.RecordConsent)
			p.GET("users/me/export", middleware.AuthRateLimit(), meH.Export)
			p.DELETE("users/me", middleware.AuthRateLimit(), meH.Delete)
			p.GET("users/me/preferences", meH.GetPreferences)
			p.PUT("users/me/preferences", meH.UpdatePreferences)
			p.GET("analytics/overview", middleware.AdminOnly(), analyticsH.Overview)
			p.GET("analytics/content", middleware.AdminOnly(), analyticsH.Content)
			p.GET("analytics/search", middleware.AdminOnly(), analyticsH.Search)
			p.GET("analytics/funnel", middleware.AdminOnly(), analyticsH.Funnel)
			p.GET("analytics/cohorts", middleware.AdminOnly(), analyticsH.Cohorts)
			p.GET("analytics/recommendations", middleware.AdminOnly(), analyticsH.Recommendations)
			p.GET("analytics/users/engagement", middleware.AdminOnly(), analyticsH.Engagement)
			// ===== END NOTIF/ANALYTICS/SELF-SERVICE ROUTES (authenticated) =====

			// Users — list: admin only; read/update own profile; write: admin only
			// PUT /users/:id is intentionally not AdminOnly — ownership check is in the handler
			p.GET("users", middleware.AdminOnly(), userH.GetAll)
			p.POST("users", middleware.AdminOnly(), userH.Create)
			p.GET("users/:id", userH.GetByID)
			p.GET("users/:id/groups", userH.GetGroups)
			p.PUT("users/:id", userH.Update)
			p.DELETE("users/:id", userH.Delete)
			p.POST("users/:id/activate", middleware.AdminOnly(), userH.Activate)
			p.POST("users/:id/deactivate", middleware.AdminOnly(), userH.Deactivate)

			// Groups — read: any authenticated user; write: admin only
			p.GET("user-groups", groupH.GetAll)
			p.GET("user-groups/:id", groupH.GetByID)
			p.POST("user-groups", middleware.AdminOnly(), groupH.Create)
			p.PUT("user-groups/:id", middleware.AdminOnly(), groupH.Update)
			p.DELETE("user-groups/:id", middleware.AdminOnly(), groupH.Delete)
			p.GET("user-groups/:id/members", middleware.AdminOnly(), groupH.GetMembers)
			p.POST("user-groups/:id/members", middleware.AdminOnly(), groupH.AddMember)
			p.DELETE("user-groups/:id/members/:userId", middleware.AdminOnly(), groupH.RemoveMember)
			p.GET("user-groups/:id/categories", catH.GetGroupCategories)

			// Categories — GET is public (see above); write operations are admin only
			p.POST("categories", middleware.AdminOnly(), catH.Create)
			p.PUT("categories/:id", middleware.AdminOnly(), catH.Update)
			p.DELETE("categories/:id", middleware.AdminOnly(), catH.Delete)
			p.GET("categories/:id/tags", tagH.GetCategoryTags)
			p.PUT("categories/:id/tags", middleware.AdminOnly(), tagH.SetCategoryTags)
			// Category reviewer group management (admin only)
			p.GET("categories/:id/reviewer-groups", catH.GetReviewerGroups)
			p.POST("categories/:id/reviewer-groups", middleware.AdminOnly(), catH.AddReviewerGroup)
			p.DELETE("categories/:id/reviewer-groups/:gid", middleware.AdminOnly(), catH.RemoveReviewerGroup)
			p.GET("categories/:id/reviewers", catH.GetReviewers)

			// Tags (GET is public — see above; only write operations require auth)
			p.POST("tags", middleware.AdminOnly(), tagH.Create)
			p.DELETE("tags/:id", middleware.AdminOnly(), tagH.Delete)

			// Topics (GET is public — see above; write operations are admin only)
			p.POST("topics", middleware.AdminOnly(), topicH.Create)
			p.PUT("topics/:id", middleware.AdminOnly(), topicH.Update)
			p.DELETE("topics/:id", middleware.AdminOnly(), topicH.Delete)
			p.PUT("topics/:id/relationships", middleware.AdminOnly(), topicH.SetRelationships)

			// Content Types (admin only)
			p.POST("content-types", middleware.AdminOnly(), ctH.Create)
			p.PUT("content-types/:id", middleware.AdminOnly(), ctH.Update)
			p.DELETE("content-types/:id", middleware.AdminOnly(), ctH.Delete)

			// Learning Paths (admin only)

			p.POST("learning-paths", middleware.AdminOnly(), lpH.Create)
			p.PUT("learning-paths/:id", middleware.AdminOnly(), lpH.Update)
			p.DELETE("learning-paths/:id", middleware.AdminOnly(), lpH.Delete)
			p.PUT("learning-paths/:id/courses", middleware.AdminOnly(), lpH.SetCourses)

			// CMS (articles + courses unified)
			p.GET("cms", cmsH.GetAll)
			p.GET("cms/:id", cmsH.GetByID)
			p.POST("cms", cmsH.Create)
			p.PUT("cms/:id", cmsH.Update)
			p.DELETE("cms/:id", cmsH.Delete)
			p.POST("cms/:id/submit", cmsH.Submit)
			p.POST("cms/:id/approve", cmsH.Approve)
			p.POST("cms/:id/publish", cmsH.Publish)
			p.POST("cms/:id/send-back", cmsH.SendBack)
			p.POST("cms/:id/reject", cmsH.Reject)
			p.GET("cms/:id/activity", cmsH.GetActivity)
			p.POST("cms/:id/claim-review", cmsH.ClaimReview)
			p.POST("cms/:id/reassign-review", cmsH.ReassignReview)
			p.POST("cms/:id/review-note", cmsH.SaveReviewNote)
			p.POST("cms/:id/assign-reviewer", middleware.AdminOnly(), cmsH.AssignReviewer)
			p.PUT("cms/:id/topics", topicH.SetContentTopics)

			// Sections (GET is public — see above; write operations require auth)
			p.POST("sections", secH.Create)
			p.PUT("sections/:id", secH.Update)
			p.DELETE("sections/:id", secH.Delete)

			// Lessons
			p.GET("lessons", lesH.GetAll)
			p.POST("lessons", lesH.Create)
			p.PUT("lessons/:id", lesH.Update)
			p.DELETE("lessons/:id", lesH.Delete)

			// Enrollments
			p.GET("enrollments", enrH.GetAll)
			p.POST("enrollments", enrH.Create)
			p.PUT("enrollments/:id", enrH.Update)
			// learning-loop:routes
			p.GET("enrollments/me/:courseId/resume", enrH.Resume)
			p.POST("enrollments/sync-local", enrH.SyncLocal)
			p.GET("learning-paths/:id/progress", enrH.PathProgress)
			p.GET("assessments/:id", assessH.Get)
			p.POST("assessments/:id/attempts", assessH.Start)
			p.GET("assessments/:id/attempts/me", assessH.History)
			p.POST("assessments/:id/attempts/:attemptId/submit", assessH.Submit)
			p.PUT("courses/:id/completion-requirement", middleware.AdminOnly(), assessH.SetCourseRequirement)
			p.GET("certificates/me", certH.ListMine)
			p.GET("certificates/:code/pdf", certH.PDF)
			p.POST("certificates/:code/revoke", middleware.AdminOnly(), certH.Revoke)
			// /learning-loop:routes

			// Tasks
			p.GET("tasks", taskH.GetAll)
			p.GET("tasks/:id", taskH.GetByID)
			p.POST("tasks", taskH.Create)
			p.PUT("tasks/:id", taskH.Update)
			p.DELETE("tasks/:id", taskH.Delete)

			// Notifications — register specific path before wildcard
			p.PATCH("notifications/read-all", notifH.MarkAllAsRead)
			p.GET("notifications", notifH.GetAll)
			p.PATCH("notifications/:id/read", notifH.MarkAsRead)

			// Review comments (write/delete only — GET is public above)
			p.GET("review-comments", commH.GetByContent)
			p.GET("review-comments/:id/replies", commH.ListReplies)
			p.POST("review-comments", commH.Create)
			p.DELETE("review-comments/:id", commH.Delete)

			// File upload
			p.POST("upload", mediaH.Upload)

			// Bulk import — preview parses files without writing; confirm creates DRAFTs
			p.POST("import/preview", importH.Preview)
			p.POST("import/confirm", importH.Confirm)

			// Analytics (admin only)
			p.GET("analytics/dashboard", middleware.AdminOnly(), analyticsH.GetDashboard)

			// Audit log (admin only) — GET /api/audit?action=&targetType=&page=0&size=20
			p.GET("audit", middleware.AdminOnly(), auditH.List)
			p.GET("audit/download", middleware.AdminOnly(), auditH.Download)

			// Log management & debug logs
			p.POST("logs/client", middleware.ClientLogRateLimit(), logH.RecordClientLog)
			p.GET("logs/debug", middleware.AdminOnly(), logH.GetDebugLogs)
			p.GET("logs/download", middleware.AdminOnly(), logH.DownloadLogs)

			// Personalization — profile + recommendations
			p.GET("personalization/profile", personH.GetProfile)
			p.PUT("personalization/profile", personH.UpsertProfile)
			p.GET("personalization/profiles", personH.GetProfiles)
			p.POST("personalization/profiles", personH.CreateProfile)
			p.PUT("personalization/profiles/:id/activate", personH.ActivateProfile)
			p.GET("personalization/recommendations", personH.GetRecommendations)
			p.GET("personalization/feed", personH.GetFeed)

			// ===== AI LAYER (routes) =====
			ai := p.Group("ai")
			{
				ai.GET("status", aiH.Status)
				ai.POST("tags/suggest", aiH.SuggestTags)
				ai.POST("summary", aiH.Summary)
				ai.POST("seo", aiH.SEO)
				ai.POST("quality-check", aiH.QualityCheck)
				ai.POST("quiz/generate", aiH.GenerateQuiz)
				ai.GET("drafts", aiH.ListDrafts)
				ai.POST("drafts/:id/accept", aiH.AcceptDraft)
				ai.POST("drafts/:id/reject", aiH.RejectDraft)

				ai.POST("tutor/ask", middleware.RequireVerifiedEmail(), aiH.Ask)
				ai.GET("tutor/conversations", aiH.ListConversations)
				ai.GET("tutor/conversations/:id", aiH.GetConversation)
				ai.DELETE("tutor/conversations/:id", aiH.DeleteConversation)
				ai.POST("tutor/messages/:id/feedback", aiH.Feedback)
				ai.POST("study-plan", middleware.RequireVerifiedEmail(), aiH.StudyPlan)

				ai.GET("moderation", middleware.AdminOnly(), aiH.ModerationQueue)
				ai.POST("moderation/:id/approve", middleware.AdminOnly(), aiH.ApproveModeration)
				ai.POST("moderation/:id/reject", middleware.AdminOnly(), aiH.RejectModeration)
				ai.GET("usage", middleware.AdminOnly(), aiH.Usage)
				ai.GET("settings", middleware.AdminOnly(), aiH.GetSettings)
				ai.PUT("settings", middleware.AdminOnly(), aiH.UpdateSettings)
				ai.POST("admin/reindex", middleware.AdminOnly(), aiH.Reindex)
			}
			// ===== END AI LAYER (routes) =====

			// App settings (admin only)
			p.GET("settings", middleware.AdminOnly(), settingsH.GetAll)
			p.PUT("settings", middleware.AdminOnly(), settingsH.Update)
			p.POST("settings/test-storage", middleware.AdminOnly(), settingsH.TestStorage)

			// Engagement (reactions, notes, favourites, highlights)
			eng := p.Group("engagement")
			{
				// Per-content reactions
				eng.POST(":contentType/:contentId/react", engH.React)
				eng.DELETE(":contentType/:contentId/react", engH.Unreact)
				eng.GET(":contentType/:contentId/reactions", engH.GetReactions)

				// Per-content notes
				eng.PUT(":contentType/:contentId/note", engH.UpsertNote)
				eng.GET(":contentType/:contentId/note", engH.GetNote)

				// User's notes list + delete
				eng.GET("notes", engH.ListMyNotes)
				eng.DELETE("notes/:id", engH.DeleteNote)

				// Per-content favourites
				eng.POST(":contentType/:contentId/favourite", engH.ToggleFavourite)
				eng.GET(":contentType/:contentId/favourite", engH.IsFavourited)

				// User's favourites list
				eng.GET("favourites", engH.ListMyFavourites)

				// Per-content highlights
				eng.POST(":contentType/:contentId/highlights", engH.CreateHighlight)
				eng.GET(":contentType/:contentId/highlights", engH.ListHighlights)

				// User's highlights list + delete + update
				eng.GET("highlights", engH.ListMyHighlights)
				eng.PUT("highlights/:id", engH.UpdateHighlight)
			}
		}
	}

	// search-seo:crawler-routes
	r.GET("/sitemap.xml", middleware.PublicRateLimit(), seoH.Sitemap)
	r.GET("/sitemaps/:file", middleware.PublicRateLimit(), seoH.Sitemap)
	r.GET("/robots.txt", middleware.PublicRateLimit(), seoH.Robots)
	// /search-seo:crawler-routes

	// Serve React SPA frontend HTML for non-API routes
	if _, err := os.Stat("dist"); err == nil {
		r.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path
			if !strings.HasPrefix(path, "/api") && !strings.HasPrefix(path, "/graphql") && !strings.HasPrefix(path, "/uploads") {
				seoH.ServeSPA(c)
				return
			}
			c.JSON(404, gin.H{"code": 404, "message": "route not found"})
		})
	}

	return r, nil
}

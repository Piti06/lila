package lila.security

import lila.core.net.Domain
import lila.user.{ User, UserRepo }
import lila.core.user.RoleDbKey

final private[security] class Cli(
    userRepo: UserRepo,
    emailValidator: EmailAddressValidator,
    verifyMail: VerifyMail,
    gc: GarbageCollector
)(using ec: Executor)
    extends lila.common.Cli:

  def process =

    case "security" :: "roles" :: uid :: Nil =>
      userRepo
        .byId(UserStr(uid))
        .map:
          _.fold("User %s not found".format(uid))(_.roles.mkString(" "))

    case "security" :: "grant" :: uid :: roles =>
      perform(UserStr(uid), user => userRepo.setRoles(user.id, RoleDbKey.from(roles.map(_.toUpperCase))).void)

    case "disposable" :: "reload" :: emailOrDomain :: Nil =>
      WithDomain(emailOrDomain): dom =>
        for
          _ <- verifyMail.invalidate(dom)
          r <- emailValidator.validateDomain(dom)
        yield s"reloaded: $r ${r.error | ""}"

    case "disposable" :: "test" :: emailOrDomain :: Nil =>
      WithDomain(emailOrDomain): dom =>
        emailValidator
          .validateDomain(dom)
          .map: r =>
            s"$r ${r.error | ""}"

    case "garbage" :: "collect" :: uid :: Nil =>
      UserStr
        .read(uid)
        .so(userRepo.enabledById)
        .map:
          _.fold("No such user"): u =>
            gc.waitThenCollect(u, "manual GC", quickly = false)
            "GC scheduled"

  private def WithDomain(e: String)(f: Domain.Lower => Fu[String]) =
    EmailAddress
      .from(e)
      .flatMap(_.domain)
      .orElse(Domain.from(e))
      .map(_.lower)
      .fold(fuccess("Invalid email or domain"))(f)

  private def perform(u: UserStr, op: User => Funit): Fu[String] =
    userRepo
      .byId(u)
      .flatMap: userOption =>
        userOption.fold(fufail[String]("User %s not found".format(u))): u =>
          op(u).inject("User %s successfully updated".format(u))
